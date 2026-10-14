import type { AnimationPolicy, OfflinePolicy, UnauthenticatedPolicy } from "./core/config/types";

type Result = number | void;

export interface Flags {
  plain: boolean;
  json: boolean;
  config?: string;
  skip: boolean;
  yes: boolean;
  strict: boolean;
  noInput: boolean;
  force: boolean;
  offline?: OfflinePolicy;
  unauthenticated?: UnauthenticatedPolicy;
  animation?: AnimationPolicy;
}

export interface Context {
  args: string[];
  flags: Flags;
  cwd: string;
  /** stdin and stdout are terminals and --no-input wasn't passed. */
  interactive: boolean;
}

export interface Command {
  usage: string;
  description: string;
  /** Plain text output. Must not import ink/react: used with --plain and on Node < 22. */
  plain(ctx: Context): Result | Promise<Result>;
  /** Rich output. Lazy-import Ink modules (`await import(...)`) so plain mode never loads them. */
  ink(ctx: Context): Promise<Result>;
}
