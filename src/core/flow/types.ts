import type { Config, NoTerminalPolicy, OfflinePolicy, UnauthenticatedPolicy } from "../config/types";
import type { Status } from "../providers/types";
import type { Target } from "../targets";

export interface Policies {
  offline: OfflinePolicy;
  /** `report`: record failures without prompting or logging in (the `check` command). */
  unauthenticated: UnauthenticatedPolicy | "report";
  noTerminal: NoTerminalPolicy;
  /** Count skipped providers (and continuing offline) as failures. */
  strict: boolean;
}

export interface FlowOptions {
  config: Config;
  targets: Target[];
  policies: Policies;
  /** Whether prompts can be shown (a terminal on stdin and stdout, and not --no-input). */
  interactive: boolean;
}

export type FlowEvent =
  | { type: "start"; targets: Target[] }
  | { type: "online"; online: boolean | null }
  | { type: "checking"; index: number }
  | { type: "checked"; index: number; statuses: Status[] }
  | { type: "login"; index: number; command: string[] }
  | { type: "login-failed"; index: number; code: number }
  | { type: "skipped"; index: number }
  | { type: "warning"; message: string }
  | { type: "error"; message: string; hint?: string };

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** Single-key shortcut. */
  key: string;
  hint?: string;
}

/** What the flow needs from a front end. */
export interface Ui {
  emit(event: FlowEvent): void;
  /** Ask the user to pick one choice. Rejects with InterruptError on Ctrl-C. */
  choose<T extends string>(message: string, choices: Choice<T>[]): Promise<T>;
  /** Hand the terminal to a command (a login) and resolve with its exit code. */
  handOff(command: string[]): Promise<number>;
}

export interface FlowResult {
  code: number;
  online: boolean | null;
  /** Final statuses; `skipped` marks failures the user chose to skip. */
  results: Array<Status & { skipped?: true }>;
  /** Whether a login (or other fix) succeeded during the run. */
  loggedIn: boolean;
}

export class InterruptError extends Error {
  constructor() {
    super("Interrupted");
  }
}
