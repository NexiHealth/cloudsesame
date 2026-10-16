import type { Deps } from "../deps";
import type { Exec } from "../exec";
import type { ProviderId } from "../config/types";

/** `denied`: authenticated, but missing permissions. Logging in again doesn't fix it, so it never has a `fix`. */
export type State = "ok" | "unauthenticated" | "mismatch" | "denied" | "missing" | "error";

export interface Status {
  provider: ProviderId;
  /** What was checked, e.g. "user", "adc", "nexihealth-admin". */
  label: string;
  state: State;
  /** Who you're authenticated as, when known. */
  identity?: string;
  /** What's wrong, when state isn't ok. */
  message?: string;
  /** Command that fixes it (usually a login), when there is one. */
  fix?: string[];
}

export interface CheckContext {
  exec: Exec;
  http: Deps["http"];
  readFile: Deps["readFile"];
  env: Deps["env"];
  timeout: number;
}

export interface Provider<T> {
  id: ProviderId;
  cli: string;
  install: string;
  check(target: T, ctx: CheckContext): Promise<Status[]>;
}

/** First meaningful line of a CLI error, without the "ERROR: (gcloud.x.y)" style prefixes. */
export function firstLine(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return (line ?? "unknown error").replace(/^(ERROR:\s*(\([^)]*\)\s*)?|aws: \[ERROR\]:\s*)/i, "");
}
