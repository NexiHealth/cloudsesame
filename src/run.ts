import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import type { Context } from "./command";
import { commands } from "./commands";
import { UsageError } from "./core/check";
import { ConfigError } from "./core/config/load";
import { ExitCode } from "./core/exit";
import { isPlain } from "./ui/mode";

// Injected by GoReleaser (`--define`) for release binaries; npm builds use package.json.
declare const __VERSION__: string | undefined;
export const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : pkg.version;

const width = Math.max(...Object.values(commands).map((c) => c.usage.length));

const HELP = `${pkg.name} v${VERSION}

Usage:
  ${pkg.name} <command> [options]

Commands:
${Object.values(commands)
  .map((c) => `  ${c.usage.padEnd(width)}  ${c.description}`)
  .join("\n")}

Options:
  -c, --config <file>  Config file (default: nearest sesame.config.{ts,mts,js,mjs,json} up to the git root)
  --json               JSON output
  --plain              Plain text output without Ink (also: CLOUDSESAME_PLAIN=1; automatic on Node < 22)
  -h, --help           Show help
  -v, --version        Show version

Exit codes:
  0 ok · 1 error · 2 usage/config error · 3 offline · 4 not authenticated · 5 stopped`;

export async function run(argv: string[], cwd = process.cwd()): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        plain: { type: "boolean" },
        json: { type: "boolean" },
        config: { type: "string", short: "c" },
      },
    });
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${HELP}`);
    return ExitCode.Usage;
  }
  const { values, positionals } = parsed;

  if (values.version) {
    console.log(VERSION);
    return ExitCode.Ok;
  }

  const [name, ...args] = positionals;

  if (values.help || name === undefined) {
    console.log(HELP);
    return ExitCode.Ok;
  }

  const command = commands[name];
  if (!command) {
    console.error(`Unknown command: ${name}\n\n${HELP}`);
    return ExitCode.Usage;
  }

  const ctx: Context = {
    args,
    cwd,
    flags: { plain: values.plain === true, json: values.json === true, config: values.config },
  };

  try {
    const result = isPlain(ctx.flags.plain) ? await command.plain(ctx) : await command.ink(ctx);
    return result ?? ExitCode.Ok;
  } catch (error) {
    if (error instanceof ConfigError || error instanceof UsageError) {
      console.error(`✖ ${error.message}`);
      return ExitCode.Usage;
    }
    throw error;
  }
}
