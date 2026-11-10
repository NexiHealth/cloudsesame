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
  /** `env`: syntax of the printed exports. */
  shell?: ExportShell;
}

export type ExportShell = "sh" | "fish" | "pwsh";

export interface Context {
  args: string[];
  /** Command after `--`, run once ready (`cloudsesame infra -- tofu plan`). */
  command?: string[];
  /** Our output goes to stderr: stdout belongs to `command`, or to `eval` (`env`). */
  stderr: boolean;
  flags: Flags;
  cwd: string;
  /** stdin and our output stream (stdout, or stderr with `stderr`) are terminals, and --no-input wasn't passed. */
  interactive: boolean;
}

export interface Command {
  usage: string;
  description: string;
  /** Stdout is the command's result (e.g. `env` prints exports): status and prompts go to stderr. */
  stdoutIsResult?: boolean;
  /** Plain text output. Must not import ink/react: used with --plain and on Node < 22. */
  plain(ctx: Context): Result | Promise<Result>;
  /** Rich output. Lazy-import Ink modules (`await import(...)`) so plain mode never loads them. */
  ink(ctx: Context): Promise<Result>;
}
