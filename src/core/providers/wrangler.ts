import type { WranglerTarget } from "../config/types";
import { firstLine, type Provider, type Status } from "./types";

interface Whoami {
  loggedIn?: boolean;
  authType?: string;
  email?: string;
  accounts?: Array<{ id: string; name: string }>;
}

function parse(text: string): Whoami | undefined {
  try {
    return JSON.parse(text) as Whoami;
  } catch {
    return undefined;
  }
}

/** Wrangler's error box: "✘ [ERROR] A request … failed." plus the API's reason on the next line. */
export function wranglerError(stderr: string): string {
  // Strip ANSI colors, in case FORCE_COLOR is overridden.
  const lines = stderr.replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const index = lines.findIndex((l) => /\[ERROR\]/.test(l));
  if (index === -1) return firstLine(lines.join("\n"));
  const message = lines[index]!.replace(/^.*\[ERROR\]\s*/, "");
  const reason = lines[index + 1];
  return reason && !/^(If you think|🪵|Logs were written)/.test(reason) ? `${message.replace(/\.$/, "")}: ${reason}` : message;
}

/**
 * The credentials wrangler deploys with: its OAuth login (`wrangler login`), or `CLOUDFLARE_API_TOKEN` when set,
 * which wrangler prefers. `wrangler whoami --json` refreshes an expired OAuth token, and without a terminal
 * it fails instead of starting a login.
 */
export const wrangler: Provider<WranglerTarget> = {
  id: "wrangler",
  cli: "wrangler",
  install: "https://developers.cloudflare.com/workers/wrangler/install-and-update/",
  async check(target, { exec, env, timeout }) {
    const usesToken = !!(env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_API_KEY);
    const label = usesToken ? "token" : "login";
    // `wrangler login` refuses to run while a token is set, so a bad token has no fix to offer.
    const fix = usesToken ? undefined : ["wrangler", "login"];
    const res = await exec("wrangler", ["whoami", "--json"], { timeout, env: { WRANGLER_SEND_METRICS: "false", FORCE_COLOR: "0", NO_COLOR: "1" } });
    const whoami = parse(res.stdout);

    if (res.code !== 0 || !whoami?.loggedIn) {
      const message = whoami?.loggedIn === false ? "not logged in" : wranglerError(res.stderr);
      return [{ provider: "wrangler", label, state: "unauthenticated", message: usesToken ? `CLOUDFLARE_API_TOKEN: ${message}` : message, fix }];
    }

    const accounts = whoami.accounts ?? [];
    const identity = whoami.email ?? accounts[0]?.name;
    const status: Status = { provider: "wrangler", label, state: "ok", identity };
    if (target.account && !accounts.some((a) => a.id === target.account || a.name === target.account)) {
      const reachable = accounts.map((a) => a.name).join(", ") || "none";
      return [{ ...status, state: "mismatch", message: `no access to account ${target.account} (has: ${reachable})`, fix }];
    }
    return [status];
  },
};
