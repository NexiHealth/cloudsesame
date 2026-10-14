import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };

// Injected by GoReleaser (`--define`) for release binaries; npm builds use package.json.
declare const __VERSION__: string | undefined;
export const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : pkg.version;

const HELP = `${pkg.name} v${VERSION}

Usage:
  ${pkg.name} <command> [options]

Commands:
  hello [name]   Print a greeting

Options:
  -h, --help     Show help
  -v, --version  Show version`;

export function run(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.version) {
    console.log(VERSION);
    return 0;
  }

  const [command, ...rest] = positionals;

  if (values.help || command === undefined) {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "hello":
      console.log(`Hello, ${rest[0] ?? "world"}!`);
      return 0;
    default:
      console.error(`Unknown command: ${command}\n\n${HELP}`);
      return 1;
  }
}
