import type { Deps } from "./deps";
import { providers } from "./providers";
import type { Status } from "./providers/types";
import type { Target } from "./targets";

const context = (deps: Deps, timeout: number) => ({ exec: deps.exec, which: deps.which, http: deps.http, readFile: deps.readFile, env: deps.env, timeout });

/** Check one target. Never throws: failures become statuses. */
export async function checkTarget(t: Target, deps: Deps, timeout: number): Promise<Status[]> {
  const provider = providers[t.provider];
  if (provider.cli && !deps.which(provider.cli)) {
    return [{ provider: t.provider, label: "cli", state: "missing", message: `${provider.cli} CLI not found. Install: ${provider.install}` }];
  }
  try {
    return await provider.check(t.target, context(deps, timeout));
  } catch (error) {
    return [{ provider: t.provider, label: provider.cli ?? provider.id, state: "error", message: (error as Error).message }];
  }
}

/** Environment the ready targets provide for a command run after the checks. Later targets win on conflicts. */
export async function commandEnv(targets: Target[], deps: Deps, timeout: number): Promise<Record<string, string>> {
  const envs = await Promise.all(targets.map((t) => providers[t.provider].env?.(t.target, context(deps, timeout))));
  return Object.assign({}, ...envs);
}

export const isReady = (statuses: Status[]) => statuses.every((s) => s.state === "ok");

/** The command that fixes the first failing status, if any. */
export const fixFor = (statuses: Status[]) => statuses.find((s) => s.state !== "ok" && s.fix)?.fix;
