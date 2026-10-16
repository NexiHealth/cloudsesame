import type { Deps } from "./deps";
import { providers } from "./providers";
import type { Status } from "./providers/types";
import type { Target } from "./targets";

/** Check one target. Never throws: failures become statuses. */
export async function checkTarget(t: Target, deps: Deps, timeout: number): Promise<Status[]> {
  const provider = providers[t.provider];
  if (!deps.which(provider.cli)) {
    return [{ provider: t.provider, label: "cli", state: "missing", message: `${provider.cli} CLI not found. Install: ${provider.install}` }];
  }
  try {
    return await provider.check(t.target, { exec: deps.exec, readFile: deps.readFile, env: deps.env, timeout });
  } catch (error) {
    return [{ provider: t.provider, label: provider.cli, state: "error", message: (error as Error).message }];
  }
}

export const isReady = (statuses: Status[]) => statuses.every((s) => s.state === "ok");

/** The command that fixes the first failing status, if any. */
export const fixFor = (statuses: Status[]) => statuses.find((s) => s.state !== "ok" && s.fix)?.fix;
