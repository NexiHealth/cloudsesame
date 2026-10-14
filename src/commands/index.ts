import type { Command } from "../command";
import { flowCommand } from "./flow";
import { init } from "./init";

export const commands: Record<string, Command> = {
  auth: flowCommand("auth", {
    usage: "auth [providers|groups...]",
    description: "Make sure you're logged in; offers to log in (default command)",
  }),
  predev: flowCommand("predev", {
    usage: "predev [providers|groups...]",
    description: "Connectivity check, then auth; skipping is allowed",
  }),
  check: flowCommand("check", {
    usage: "check [providers|groups...]",
    description: "Report connectivity and login status; never prompts",
  }),
  init,
};

export const DEFAULT_COMMAND = "auth";
