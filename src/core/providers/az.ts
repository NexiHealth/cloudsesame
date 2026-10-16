import type { AzTarget } from "../config/types";
import type { Exec } from "../exec";
import { firstLine, type Provider, type Status } from "./types";

export const az: Provider<AzTarget> = {
  id: "az",
  cli: "az",
  install: "https://learn.microsoft.com/cli/azure/install-azure-cli",
  async check(target, { exec, timeout }) {
    const label = target.subscription ?? target.tenant ?? "account";
    const login = ["az", "login", ...(target.tenant ? ["--tenant", target.tenant] : [])];
    const run = (...args: string[]) => exec("az", [...args, "--only-show-errors"], { timeout });

    // `account show` only reads the cache; `get-access-token` proves the refresh token still works.
    const [account, token] = await Promise.all([
      run("account", "show", "--output", "json"),
      run("account", "get-access-token", "--output", "none", ...(target.tenant ? ["--tenant", target.tenant] : [])),
    ]);

    if (account.code !== 0 || token.code !== 0) {
      return [{ provider: "az", label, state: "unauthenticated", message: firstLine(token.stderr || account.stderr), fix: login }];
    }

    const { id, name, tenantId, user } = JSON.parse(account.stdout) as { id: string; name: string; tenantId: string; user?: { name?: string } };
    const identity = user?.name;

    if (target.tenant && tenantId !== target.tenant) {
      return [{ provider: "az", label, state: "mismatch", identity, message: `expected tenant ${target.tenant}`, fix: login }];
    }
    if (target.subscription && id !== target.subscription && name !== target.subscription) {
      return [
        {
          provider: "az",
          label,
          state: "mismatch",
          identity,
          message: `expected subscription ${target.subscription}, active is ${name}`,
          fix: ["az", "account", "set", "--subscription", target.subscription],
        },
      ];
    }
    const statuses: Status[] = [{ provider: "az", label, state: "ok", identity }];
    if (target.actions || target.dataActions) {
      const wanted = [
        ...(target.actions ?? []).map((name) => ({ name, data: false })),
        ...(target.dataActions ?? []).map((name) => ({ name, data: true })),
      ];
      statuses.push(await checkPermissions(run, target.permissionScope ?? `/subscriptions/${id}`, wanted));
    }
    return statuses;
  },
};

interface Permission {
  actions?: string[];
  notActions?: string[];
  dataActions?: string[];
  notDataActions?: string[];
}

/** Checks actions and data actions against what the caller is allowed at `scope` (`Microsoft.Authorization/permissions`). */
async function checkPermissions(
  run: (...args: string[]) => ReturnType<Exec>,
  scope: string,
  wanted: Array<{ name: string; data: boolean }>,
): Promise<Status> {
  const base = { provider: "az", label: "permissions", identity: scope } as const;
  const entries: Permission[] = [];
  // A relative URL is resolved against the current cloud's ARM endpoint.
  let url: string | undefined = `${scope}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`;
  while (url) {
    const res = await run("rest", "--method", "get", "--url", url, "--output", "json");
    if (res.code !== 0) {
      return /AuthorizationFailed|Forbidden|\b403\b/i.test(res.stderr)
        ? { ...base, state: "denied", message: `no access to ${scope}` }
        : { ...base, state: "error", message: firstLine(res.stderr) };
    }
    const page = JSON.parse(res.stdout) as { value?: Permission[]; nextLink?: string };
    entries.push(...(page.value ?? []));
    url = page.nextLink;
  }
  const missing = wanted.filter((w) => !isAllowed(entries, w.name, w.data)).map((w) => w.name);
  return missing.length > 0 ? { ...base, state: "denied", message: `missing ${missing.join(", ")}` } : { ...base, state: "ok" };
}

/** Allowed if some role grants it without excluding it in that same role. Actions and data actions never mix. */
export function isAllowed(entries: Permission[], permission: string, data = false): boolean {
  const matches = (patterns: string[] = []) => patterns.some((p) => wildcard(p).test(permission));
  return entries.some((e) => (data ? matches(e.dataActions) && !matches(e.notDataActions) : matches(e.actions) && !matches(e.notActions)));
}

// Azure actions are case-insensitive; `*` matches anything, including `/`.
const wildcard = (pattern: string) => new RegExp(`^${pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
