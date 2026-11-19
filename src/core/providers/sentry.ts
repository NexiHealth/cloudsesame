import { homedir } from "node:os";
import { join } from "node:path";
import type { SentryTarget } from "../config/types";
import type { HttpResponse } from "../http";
import { bunPath, installBun } from "./bun";
import type { CheckContext, Provider, Status } from "./types";

export const SENTRY_URL = "https://sentry.io";

/**
 * Where to create a personal (user) token. `sentry-cli login` opens the organization tokens page instead, whose tokens
 * only get `org:ci` (releases, source maps): not enough for OpenTofu.
 */
export const personalTokensUrl = (url: string) => `${url}/settings/account/api/auth-tokens/`;

/** How to run `sentry-cli`: installed, or through Bun (`bun x @sentry/cli`). */
export function sentryCliCommand(which: CheckContext["which"], env: NodeJS.ProcessEnv, home = homedir()): string[] | undefined {
  if (which("sentry-cli")) return ["sentry-cli"];
  const bun = bunPath(which, env, home);
  return bun ? [bun, "x", "@sentry/cli"] : undefined;
}

/** `[section]` -> key -> value, as sentry-cli's `.sentryclirc` is written. Keys outside a section go under "". */
export function parseIni(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { "": {} };
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      section = header[1]!.trim();
      out[section] ??= {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq > 0) out[section]![line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

/** Organization tokens (`sntrys_<base64 JSON>_<secret>`) carry the URL of their Sentry. */
export function orgTokenUrl(token: string | undefined): string | undefined {
  if (!token?.startsWith("sntrys_")) return undefined;
  const payload = token.slice("sntrys_".length, token.lastIndexOf("_"));
  try {
    const url = (JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { url?: unknown }).url;
    return typeof url === "string" && url ? url : undefined;
  } catch {
    return undefined;
  }
}

/** `https://sentry.acme.dev/api/` -> `https://sentry.acme.dev`. */
const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, "").replace(/\/api(\/0)?$/, "");

/**
 * Scopes each scope grants, from Sentry's `SENTRY_SCOPE_HIERARCHY_MAPPING`: `admin` > `write` > `read` on the same
 * resource (with a few extras). Scopes not listed grant only themselves, e.g. `dashboard:write` doesn't grant read.
 */
const IMPLIED: Record<string, string[]> = {
  "org:write": ["org:read"],
  "org:admin": ["org:read", "org:write", "org:integrations"],
  "member:invite": ["member:read"],
  "member:write": ["member:read", "member:invite"],
  "member:admin": ["member:read", "member:invite", "member:write"],
  "team:write": ["team:read"],
  "team:admin": ["team:read", "team:write"],
  "project:write": ["project:read"],
  "project:admin": ["project:read", "project:write"],
  "event:write": ["event:read"],
  "event:admin": ["event:read", "event:write"],
  "alerts:write": ["alerts:read"],
};

export function missingScopes(granted: string[], required: string[]): string[] {
  const have = new Set(granted.flatMap((s) => [s, ...(IMPLIED[s] ?? [])]));
  return required.filter((s) => !have.has(s));
}

interface Credentials {
  /** The token, from `tokenEnv` or the sentry-cli login. */
  token?: string;
  /** Sentry's base URL, without `/api/`. */
  url: string;
  /** The variable the token came from; undefined for the sentry-cli login. */
  fromEnv?: string;
}

/** The token sentry-cli would use, and its Sentry URL. Same precedence as sentry-cli: env, then `~/.sentryclirc`. */
async function credentials(target: SentryTarget, { env, readFile }: CheckContext, home = homedir()): Promise<Credentials> {
  const tokenEnv = target.tokenEnv ?? "SENTRY_AUTH_TOKEN";
  const rc = parseIni((await readFile(join(home, ".sentryclirc"))) ?? "");
  const envToken = env[tokenEnv]?.trim() || undefined;
  const token = envToken ?? (rc.auth?.token || undefined);
  const url = normalizeUrl(target.url ?? orgTokenUrl(token) ?? (env.SENTRY_URL?.trim() || undefined) ?? rc.defaults?.url ?? SENTRY_URL);
  return { token, url, fromEnv: envToken ? tokenEnv : undefined };
}

interface ApiIndex {
  /** null for anonymous requests. */
  auth?: { scopes?: string[] } | null;
  /** null for organization tokens. */
  user?: { email?: string; username?: string } | null;
}

function json<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function apiError(res: HttpResponse): string {
  if (res.status === 0) return res.body;
  return json<{ detail?: string }>(res.body)?.detail ?? `HTTP ${res.status}`;
}

/**
 * For OpenTofu/Terraform's Sentry provider (`jianyuan/sentry`), which reads `SENTRY_AUTH_TOKEN` (and `SENTRY_BASE_URL`
 * for self-hosted Sentry) but not sentry-cli's login.
 * - `SENTRY_AUTH_TOKEN` (or `tokenEnv`) set, e.g. in CI: that token is verified.
 * - Otherwise the token `sentry-cli login` saved in `~/.sentryclirc`. It doesn't expire unless revoked.
 * Either way, the token is checked against `GET /api/0/` (who it belongs to, and its scopes) and passed on to commands.
 */
export const sentry: Provider<SentryTarget> = {
  id: "sentry",
  install: "https://docs.sentry.io/cli/installation/",
  async check(target, ctx) {
    const { token, url, fromEnv } = await credentials(target, ctx);
    const base = { provider: "sentry", label: fromEnv ? "token" : "login" } as const;
    const cli = sentryCliCommand(ctx.which, ctx.env);
    // `--url` is a global sentry-cli option, so it goes before `login`.
    const loginFix = cli && (url === SENTRY_URL ? [...cli, "login"] : [...cli, "--url", url, "login"]);
    // sentry-cli only saves the login; an env token can't be fixed by logging in.
    const fix = fromEnv ? undefined : loginFix;

    if (!token) {
      if (!loginFix) return [{ ...base, state: "missing", message: "not logged in, and sentry-cli needs Bun to run (bun x @sentry/cli). Install Bun?", fix: installBun() }];
      return [{ ...base, state: "unauthenticated", message: `not logged in. sentry-cli offers organization tokens (org:ci only): answer n, then paste a personal token from ${personalTokensUrl(url)}`, fix: loginFix }];
    }

    const get = (path: string) => ctx.http(`${url}/api/0${path}`, { method: "GET", headers: { authorization: `Bearer ${token}` }, timeout: ctx.timeout });
    const res = await get("/");
    const index = res.status === 200 ? json<ApiIndex>(res.body) : undefined;
    const what = fromEnv ?? "sentry-cli's token";
    if (res.status === 401 || (index && !index.auth)) return [{ ...base, state: "unauthenticated", message: `${what} is invalid or revoked: ${apiError(res)}`, fix }];
    if (!index) return [{ ...base, state: "error", message: `${url}: ${apiError(res)}` }];

    const identity = index.user?.email ?? index.user?.username ?? "organization token";
    const status: Status = { ...base, state: "ok", identity: url === SENTRY_URL ? identity : `${identity} (${new URL(url).host})` };
    // What `sentry-cli login` steers you to. In CI (`fromEnv`) it's a deliberate choice, and `scopes` judges it.
    if (!fromEnv && !index.user) {
      return [{ ...status, state: "mismatch", message: `sentry-cli has an organization token (org:ci only, can't manage projects). Log in again with a personal token from ${personalTokensUrl(url)}`, fix }];
    }

    if (target.organization) {
      const org = await get(`/organizations/${encodeURIComponent(target.organization)}/`);
      if (org.status === 0 || org.status >= 500) return [{ ...status, state: "error", message: `${target.organization}: ${apiError(org)}` }];
      if (org.status !== 200) return [{ ...status, state: "mismatch", message: `no access to organization ${target.organization}`, fix }];
    }

    const statuses = [status];
    if (target.scopes) {
      const missing = missingScopes(index.auth?.scopes ?? [], target.scopes);
      statuses.push(
        missing.length > 0
          ? { provider: "sentry", label: "scopes", state: "denied", message: `${what} lacks ${missing.join(", ")}: create a personal token with them at ${personalTokensUrl(url)}` }
          : { provider: "sentry", label: "scopes", state: "ok", identity: target.scopes.join(", ") },
      );
    }
    return statuses;
  },
  async env(target, ctx): Promise<Record<string, string>> {
    const { token, url } = await credentials(target, ctx);
    if (!token) return {};
    // The OpenTofu provider wants the API root, "https://[hostname]/api/".
    return url === SENTRY_URL ? { SENTRY_AUTH_TOKEN: token } : { SENTRY_AUTH_TOKEN: token, SENTRY_BASE_URL: `${url}/api/` };
  },
};
