import type { AnimationPolicy, Config, OfflinePolicy, UnauthenticatedPolicy } from "../config/types";
import type { Policies } from "./types";

export type Mode = "check" | "auth" | "predev";

export interface PolicyFlags {
  skip: boolean;
  yes: boolean;
  strict: boolean;
  offline?: OfflinePolicy;
  unauthenticated?: UnauthenticatedPolicy;
}

/** Flags > config > defaults. `--skip` never prompts or fails; `--yes` logs in and continues without asking. */
export function resolvePolicies(mode: Mode, config: Config, flags: PolicyFlags): Policies {
  const noTerminal = config.noTerminal ?? "fail";
  if (mode === "check") return { offline: "fail", unauthenticated: "report", noTerminal, strict: true };

  const unauthenticated = flags.unauthenticated ?? (flags.skip ? "skip" : flags.yes ? "login" : (config.unauthenticated ?? "prompt"));
  // There's nothing to authenticate against offline, so `auth` always fails.
  const offline = mode === "auth" ? "fail" : (flags.offline ?? (flags.skip || flags.yes ? "continue" : (config.offline ?? "prompt")));
  return { offline, unauthenticated, noTerminal, strict: flags.strict };
}

export interface AnimationContext {
  policy?: AnimationPolicy;
  interactive: boolean;
  code: number;
  loggedIn: boolean;
  env?: NodeJS.ProcessEnv;
}

export function shouldAnimate({ policy = "after-login", interactive, code, loggedIn, env = process.env }: AnimationContext): boolean {
  if (policy === "never" || !interactive || code !== 0) return false;
  if (env.CI || env.NO_COLOR || env.TERM === "dumb") return false;
  return policy === "always" || loggedIn;
}
