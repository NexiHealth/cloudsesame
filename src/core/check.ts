import { providerIds } from "./config/schema";
import type { Config, ProviderId } from "./config/types";
import { exec as defaultExec, type Exec, which as defaultWhich } from "./exec";
import { ExitCode } from "./exit";
import { isOnline as defaultIsOnline } from "./online";
import { providers } from "./providers";
import type { Status } from "./providers/types";

export class UsageError extends Error {}

export interface Target {
  provider: ProviderId;
  target: object;
}

export interface Report {
  /** null when the online check is disabled. */
  online: boolean | null;
  results: Status[];
}

export interface Deps {
  exec?: Exec;
  which?: (cmd: string) => string | undefined;
  isOnline?: (target: string, timeout?: number) => Promise<boolean>;
}

const toArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/**
 * Targets to check. `names` are provider ids or group names; empty means everything configured,
 * or, with nothing configured, every provider whose CLI is installed.
 */
export function resolveTargets(config: Config, names: string[], which = defaultWhich): Target[] {
  let ids: ProviderId[];
  if (names.length > 0) {
    ids = names.flatMap((name) => {
      if ((providerIds as readonly string[]).includes(name)) return [name as ProviderId];
      const group = config.groups?.[name];
      if (group) return group;
      const known = [...providerIds, ...Object.keys(config.groups ?? {})].join(", ");
      throw new UsageError(`Unknown provider or group "${name}" (known: ${known})`);
    });
  } else {
    ids = providerIds.filter((id) => config[id] !== undefined);
    if (ids.length === 0) ids = providerIds.filter((id) => which(providers[id].cli));
  }
  return [...new Set(ids)].flatMap((provider) => {
    const targets = toArray<object>(config[provider]);
    return (targets.length > 0 ? targets : [{}]).map((target) => ({ provider, target }));
  });
}

export async function check(
  config: Config,
  targets: Target[],
  deps: Deps & { onOnline?: (online: boolean | null) => void; onResult?: (target: Target, statuses: Status[]) => void } = {},
): Promise<Report> {
  const { exec = defaultExec, which = defaultWhich, isOnline = defaultIsOnline } = deps;
  const onlineCheck = config.onlineCheck ?? "www.gstatic.com:443";
  const online = onlineCheck === false ? null : await isOnline(onlineCheck);
  deps.onOnline?.(online);
  if (online === false) return { online, results: [] };

  const timeout = config.timeout ?? 20_000;
  const perTarget = await Promise.all(
    targets.map(async (t) => {
      const provider = providers[t.provider];
      const statuses: Status[] = which(provider.cli)
        ? await provider.check(t.target, { exec, timeout }).catch((error: Error) => [{ provider: t.provider, label: provider.cli, state: "error" as const, message: error.message }])
        : [{ provider: t.provider, label: "cli", state: "missing", message: `${provider.cli} CLI not found. Install: ${provider.install}` }];
      deps.onResult?.(t, statuses);
      return statuses;
    }),
  );
  return { online, results: perTarget.flat() };
}

export function exitCode(report: Report): number {
  if (report.online === false) return ExitCode.Offline;
  return report.results.every((r) => r.state === "ok") ? ExitCode.Ok : ExitCode.Unauthenticated;
}
