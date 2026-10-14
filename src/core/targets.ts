import { providerIds } from "./config/schema";
import type { Config, ProviderId } from "./config/types";
import { which as defaultWhich } from "./exec";
import { providers } from "./providers";

export class UsageError extends Error {}

export interface Target {
  provider: ProviderId;
  target: object;
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

/** Human label for a target, e.g. "aws nexihealth-admin". */
export function targetLabel({ provider, target }: Target): string {
  const t = target as { profile?: string; subscription?: string; tenant?: string; project?: string };
  const detail =
    provider === "aws" ? (t.profile ?? process.env.AWS_PROFILE ?? "default") : provider === "az" ? (t.subscription ?? t.tenant) : t.project;
  return detail ? `${provider} ${detail}` : provider;
}
