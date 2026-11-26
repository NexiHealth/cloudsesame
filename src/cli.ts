#!/usr/bin/env node
import { ExitCode } from "./core/exit";
import { run } from "./run";

const code = await run(process.argv.slice(2));
// On Ctrl-C, don't wait for in-flight checks (child processes) to finish.
if (code === ExitCode.Interrupted) process.exit(code);
// Exit explicitly rather than waiting for the event loop to drain: under Bun, a read Ink left pending on the
// terminal keeps the process alive until the next Enter. Flush first so `eval "$(cloudsesame env)"` gets everything.
const flush = (stream: NodeJS.WriteStream) => new Promise<void>((resolve) => stream.write("", () => resolve()));
await Promise.all([flush(process.stdout), flush(process.stderr)]);
process.exit(code);
