#!/usr/bin/env node
import { ExitCode } from "./core/exit";
import { run } from "./run";

const code = await run(process.argv.slice(2));
// On Ctrl-C, don't wait for in-flight checks (child processes) to finish.
if (code === ExitCode.Interrupted) process.exit(code);
process.exitCode = code;
