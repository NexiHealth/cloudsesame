import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import type { Context, Flags } from "./command";
import { commands, DEFAULT_COMMAND } from "./commands";
import { ConfigError } from "./core/config/load";
import { ExitCode } from "./core/exit";
import { InterruptError } from "./core/flow/types";
import { UsageError } from "./core/targets";
import { isPlain } from "./ui/mode";

// Injected by GoReleaser (`--define`) for release binaries; npm builds use package.json.
declare const __VERSION__: string | undefined;
export const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : pkg.version;

const width = Math.max(...Object.values(commands).map((c) => c.usage.length));

const HELP = `${pkg.name} v${VERSION}: open sesame for your clouds

Usage:
  ${pkg.name} [command] [providers|groups...] [options]

Commands:
${Object.values(commands)
  .map((c) => `  ${c.usage.padEnd(width)}  ${c.description}`)
  .join("\n")}

  Without a command, runs \`${DEFAULT_COMMAND}\`. Providers: gcloud, aws, az, or a group from the config.

Options:
  --skip                    Never prompt or fail: skip unauthenticated providers, continue offline
  -y, --yes                 Never prompt: log in when needed, continue offline
  --strict                  Treat skipped providers (and continuing offline) as failures
  --offline <policy>        prompt | continue | fail (predev)
  --unauthenticated <p>     prompt | login | skip | fail
  --no-input                Don't prompt, as if there were no terminal
  --animation <policy>      after-login | always | never
  -c, --config <file>       Config file (default: nearest sesame.config.* up to the git root)
  --json                    JSON output (implies --no-input); for init, write sesame.config.json
  --force                   init: overwrite an existing config
  --plain                   Plain text output without Ink (also: CLOUDSESAME_PLAIN=1; automatic on Node < 22)
  -h, --help                Show help
  -v, --version             Show version

Without a terminal, prompts fail (exit 4) unless --skip is passed or the config sets noTerminal: "skip".

Exit codes:
  0 ready · 1 error · 2 usage/config error · 3 offline · 4 not authenticated · 5 stopped · 130 interrupted`;

const enumFlag = <T extends string>(name: string, value: string | undefined, allowed: readonly T[]): T | undefined => {
  if (value === undefined || (allowed as readonly string[]).includes(value)) return value as T | undefined;
  throw new UsageError(`--${name} must be one of: ${allowed.join(", ")}`);
};

function parse(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      plain: { type: "boolean" },
      json: { type: "boolean" },
      config: { type: "string", short: "c" },
      skip: { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      strict: { type: "boolean" },
      "no-input": { type: "boolean" },
      force: { type: "boolean" },
      offline: { type: "string" },
      unauthenticated: { type: "string" },
      animation: { type: "string" },
    },
  });
  const flags: Flags = {
    plain: !!values.plain,
    json: !!values.json,
    config: values.config,
    skip: !!values.skip,
    yes: !!values.yes,
    strict: !!values.strict,
    noInput: !!values["no-input"],
    force: !!values.force,
    offline: enumFlag("offline", values.offline, ["prompt", "continue", "fail"]),
    unauthenticated: enumFlag("unauthenticated", values.unauthenticated, ["prompt", "login", "skip", "fail"]),
    animation: enumFlag("animation", values.animation, ["after-login", "always", "never"]),
  };
  return { help: !!values.help, version: !!values.version, flags, positionals };
}

export async function run(argv: string[], cwd = process.cwd()): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    console.error(`✖ ${(error as Error).message}\n\nRun \`${pkg.name} --help\` for usage.`);
    return ExitCode.Usage;
  }
  const { help, version, flags, positionals } = parsed;

  if (version) {
    console.log(VERSION);
    return ExitCode.Ok;
  }
  if (help) {
    console.log(HELP);
    return ExitCode.Ok;
  }

  // `cloudsesame aws infra` is shorthand for `cloudsesame auth aws infra`.
  const [first, ...rest] = positionals;
  const named = first !== undefined && first in commands;
  const command = commands[named ? first : DEFAULT_COMMAND]!;
  const ctx: Context = {
    args: named ? rest : positionals,
    cwd,
    flags,
    interactive: !!process.stdin.isTTY && !!process.stdout.isTTY && !flags.noInput,
  };

  try {
    const result = isPlain(flags.plain) ? await command.plain(ctx) : await command.ink(ctx);
    return result ?? ExitCode.Ok;
  } catch (error) {
    if (error instanceof InterruptError) return ExitCode.Interrupted;
    if (error instanceof ConfigError || error instanceof UsageError) {
      const suffix = !named && error instanceof UsageError ? `\nCommands: ${Object.keys(commands).join(", ")}` : "";
      console.error(`✖ ${error.message}${suffix}`);
      return ExitCode.Usage;
    }
    throw error;
  }
}
