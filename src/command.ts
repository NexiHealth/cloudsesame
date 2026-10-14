type Result = number | void;

export interface Flags {
  plain: boolean;
  json: boolean;
  config?: string;
}

export interface Context {
  args: string[];
  flags: Flags;
  cwd: string;
}

export interface Command {
  usage: string;
  description: string;
  /** Plain text output. Must not import ink/react: used with --plain and on Node < 22. */
  plain(ctx: Context): Result | Promise<Result>;
  /** Rich output. Lazy-import the Ink module (`await import("./ink")`) so plain mode never loads it. */
  ink(ctx: Context): Promise<Result>;
}
