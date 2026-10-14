import type { AzTarget } from "../config/types";
import { firstLine, type Provider } from "./types";

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
    return [{ provider: "az", label, state: "ok", identity }];
  },
};
