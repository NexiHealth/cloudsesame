import { homedir } from "node:os";
import { join } from "node:path";
import type { CloudflareTarget } from "../config/types";
import { selfBun } from "../exec";
import type { HttpResponse } from "../http";
import type { CheckContext, Provider, Status } from "./types";

const API = "https://api.cloudflare.com/client/v4";
export const TOKENS_URL = "https://dash.cloudflare.com/profile/api-tokens";

/**
 * How to run Cloudflare's `cf` CLI: installed, through Bun (`bun x cf`), or through this binary acting as Bun.
 * Bun's installer puts it in `$BUN_INSTALL/bin` (default `~/.bun/bin`), which may not be on PATH yet.
 */
export function cfCommand(which: CheckContext["which"], env: NodeJS.ProcessEnv, home = homedir()): string[] | undefined {
  if (which("cf")) return ["cf"];
  const bun = which("bun") ? "bun" : (selfBun() ?? which(join(env.BUN_INSTALL ?? join(home, ".bun"), "bin", "bun")));
  return bun ? [bun, "x", "cf"] : undefined;
}

/** Bun's official installer (https://bun.sh). */
export const installBun = (platform = process.platform) =>
  platform === "win32" ? ["powershell", "-c", "irm bun.sh/install.ps1 | iex"] : ["bash", "-c", "curl -fsSL https://bun.sh/install | bash"];

interface Whoami {
  authenticated?: boolean;
  /** "OAuth token from <config file>" or "CLOUDFLARE_API_TOKEN environment variable". */
  authSource?: string;
  tokenValid?: boolean | null;
  email?: string;
  accounts?: Array<{ id: string; name: string }>;
}

interface Envelope<T> {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
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
  return json<Envelope<unknown>>(res.body)?.errors?.[0]?.message ?? `HTTP ${res.status}`;
}

/** Last token found per target, handed to the command run after the checks without asking `cf` again. */
const tokens = new WeakMap<CloudflareTarget, string>();

/**
 * Two sources, the same token type: OpenTofu/Terraform's Cloudflare provider reads `CLOUDFLARE_API_TOKEN` and nothing
 * else (it ignores CLI logins, and wrangler's OAuth login has no DNS access anyway).
 * - `CLOUDFLARE_API_TOKEN` (or `tokenEnv`) set, e.g. in CI: that token is verified.
 * - Otherwise the `cf` CLI's OAuth login (`cf auth login`). `cf auth whoami` refreshes it (it lasts an hour), and
 *   its token is passed on to commands as `CLOUDFLARE_API_TOKEN` (`env`).
 */
export const cloudflare: Provider<CloudflareTarget> = {
  id: "cloudflare",
  install: "https://bun.sh",
  async check(target, ctx) {
    const tokenEnv = target.tokenEnv ?? "CLOUDFLARE_API_TOKEN";
    const fromEnv = ctx.env[tokenEnv]?.trim();
    const login = fromEnv ? { statuses: [] as Status[], token: fromEnv } : await cfLogin(target, ctx);
    if (!login.token) return login.statuses;

    const get = (path: string) => ctx.http(`${API}${path}`, { method: "GET", headers: { authorization: `Bearer ${login.token}` }, timeout: ctx.timeout });
    const statuses = fromEnv ? [await verifyToken(get, tokenEnv, target.accountId)] : login.statuses;
    if (statuses.some((s) => s.state !== "ok")) return statuses;

    tokens.set(target, login.token);
    if (target.zones) statuses.push(await checkZones(get, target.zones, target.accountId));
    return statuses;
  },
  async env(target, ctx) {
    const tokenEnv = target.tokenEnv ?? "CLOUDFLARE_API_TOKEN";
    const token = ctx.env[tokenEnv]?.trim() || tokens.get(target) || (await cfLogin(target, ctx)).token;
    return token ? { CLOUDFLARE_API_TOKEN: token } : ({} as Record<string, string>);
  },
};

/** The `cf` CLI's login: refreshed by `cf auth whoami`, then read from the config file it reports. */
async function cfLogin(target: CloudflareTarget, { exec, which, env, readFile, timeout }: CheckContext): Promise<{ statuses: Status[]; token?: string }> {
  const base = { provider: "cloudflare", label: "login" } as const;
  const cf = cfCommand(which, env);
  if (!cf) {
    return { statuses: [{ ...base, state: "missing", message: "needs Cloudflare's cf CLI, run with Bun (bun x cf). Install Bun?", fix: installBun() }] };
  }
  const loginFix = [...cf, "auth", "login"];
  const [cmd, ...args] = cf;
  const res = await exec(cmd!, [...args, "auth", "whoami"], { timeout });
  const whoami = json<Whoami>(res.stdout);
  if (!whoami) return { statuses: [{ ...base, state: "error", message: res.stderr.trim().split("\n").at(-1) || `cf exited with ${res.code}` }] };
  if (!whoami.authenticated) return { statuses: [{ ...base, state: "unauthenticated", message: "not logged in", fix: loginFix }] };
  if (whoami.tokenValid !== true) return { statuses: [{ ...base, state: "unauthenticated", message: "login expired or revoked", fix: [...loginFix, "--force"] }] };

  const accounts = whoami.accounts ?? [];
  const status: Status = { ...base, state: "ok", identity: whoami.email ?? accounts[0]?.name };
  if (target.accountId && !accounts.some((a) => a.id === target.accountId)) {
    return { statuses: [{ ...status, state: "mismatch", message: `no access to account ${target.accountId}`, fix: [...loginFix, "--force"] }] };
  }

  const file = whoami.authSource?.match(/^OAuth token from (.+)$/)?.[1];
  const token = file ? json<{ oauth_token?: string }>((await readFile(file)) ?? "")?.oauth_token : undefined;
  if (!token) {
    // With CLOUDFLARE_AUTH_USE_KEYRING, cf keeps the token in the OS keychain, where other tools can't read it.
    const where = file ? `isn't in ${file} (stored in the OS keychain?)` : `source unknown (${whoami.authSource ?? "none"})`;
    return { statuses: [{ ...status, state: "error", message: `cf's token ${where}; it's needed for OpenTofu. Without the keychain: CLOUDFLARE_AUTH_USE_KEYRING=false cf auth login` }] };
  }
  return { statuses: [status], token };
}

/** User tokens verify at /user; account-owned tokens only at their account. */
async function verifyToken(get: (path: string) => Promise<HttpResponse>, tokenEnv: string, accountId: string | undefined): Promise<Status> {
  const base = { provider: "cloudflare", label: "token" } as const;
  let verify = await get("/user/tokens/verify");
  if (verify.status !== 200 && verify.status !== 0 && accountId) verify = await get(`/accounts/${encodeURIComponent(accountId)}/tokens/verify`);
  if (verify.status === 0) return { ...base, state: "error", message: apiError(verify) };
  if (verify.status !== 200) {
    const hint = accountId ? "" : " (for an account-owned token, set accountId)";
    return { ...base, state: "unauthenticated", message: `${tokenEnv} is invalid: ${apiError(verify)}${hint}` };
  }
  const status = json<Envelope<{ status?: string }>>(verify.body)?.result?.status;
  if (status && status !== "active") return { ...base, state: "unauthenticated", message: `${tokenEnv} is ${status}` };
  return { ...base, state: "ok", identity: tokenEnv };
}

/** Each zone must be visible to the token, and its DNS records readable (DNS Read). Edit can't be tested without writing. */
async function checkZones(get: (path: string) => Promise<HttpResponse>, zones: string[], accountId: string | undefined): Promise<Status> {
  const base = { provider: "cloudflare", label: "zones", identity: zones.join(", ") } as const;
  const results = await Promise.all(
    zones.map(async (name): Promise<{ name: string; problem?: string; error?: string }> => {
      const account = accountId ? `&account.id=${encodeURIComponent(accountId)}` : "";
      const res = await get(`/zones?name=${encodeURIComponent(name)}${account}`);
      if (res.status !== 200) return { name, error: apiError(res) };
      const zone = json<Envelope<Array<{ id: string }>>>(res.body)?.result?.[0];
      if (!zone) return { name, problem: "no access" };
      const dns = await get(`/zones/${zone.id}/dns_records?per_page=1`);
      if (dns.status === 403) return { name, problem: "can't read DNS" };
      if (dns.status !== 200) return { name, error: apiError(dns) };
      return { name };
    }),
  );
  const error = results.find((r) => r.error);
  if (error) return { ...base, state: "error", message: `${error.name}: ${error.error}` };
  const problems = results.filter((r) => r.problem);
  return problems.length > 0 ? { ...base, state: "denied", message: problems.map((r) => `${r.name}: ${r.problem}`).join(", ") } : { ...base, state: "ok" };
}
