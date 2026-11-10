import { basename } from "node:path";
import type { Command, Context, ExportShell } from "../command";
import { ExitCode } from "../core/exit";
import { UsageError } from "../core/targets";
import { check, providedEnv } from "./flow";

/** The shell to print exports for: `--shell`, else PowerShell on Windows, fish if `$SHELL` is fish, else POSIX sh. */
export function detectShell(env = process.env, platform = process.platform): ExportShell {
  if (platform === "win32") return "pwsh";
  return basename(env.SHELL ?? "") === "fish" ? "fish" : "sh";
}

/** `export`/`set -gx`/`$env:` lines, single-quoted so nothing in the value is expanded. */
export function formatExports(vars: Record<string, string>, shell: ExportShell): string {
  return Object.entries(vars)
    .map(([name, value]) => {
      if (shell === "fish") return `set -gx ${name} '${value.replace(/[\\']/g, "\\$&")}'`;
      if (shell === "pwsh") return `$env:${name} = '${value.replace(/'/g, "''")}'`;
      return `export ${name}='${value.replace(/'/g, `'\\''`)}'`;
    })
    .join("\n");
}

async function env(ctx: Context, ink: boolean): Promise<number> {
  if (ctx.flags.json) throw new UsageError("env prints shell exports; it has no --json");
  if (ctx.command) throw new UsageError("env doesn't run a command; use `cloudsesame auth -- <command>` instead");
  const checked = (await check("auth", ctx, ink))!;
  if (checked.result.code !== ExitCode.Ok) return checked.result.code;
  const vars = await providedEnv(checked);
  if (Object.keys(vars).length === 0) {
    console.error("Nothing to export: none of the checked providers need it (only cloudflare's cf login does).");
  } else {
    console.log(formatExports(vars, ctx.flags.shell ?? detectShell()));
  }
  return ExitCode.Ok;
}

export const envCommand: Command = {
  usage: "env [providers|groups...]",
  description: 'Like auth, then print exports for tools that can\'t read the logins (eval "$(cloudsesame env)")',
  stdoutIsResult: true,
  plain: (ctx) => env(ctx, false),
  ink: (ctx) => env(ctx, true),
};

/** Subcommands that reach the providers or the state backend; the rest (fmt, validate, version…) run untouched. */
export const CLOUD_SUBCOMMANDS = ["init", "plan", "apply", "destroy", "import", "refresh", "state", "output", "show", "console", "test", "taint", "untaint", "force-unlock", "workspace"];
const SHELLS = ["bash", "zsh", "fish", "pwsh", "powershell"] as const;

/**
 * Functions that shadow `tofu` (etc.) and run it through `cloudsesame auth --`, which checks the project's clouds and
 * passes on credentials. Only for subcommands in CLOUD_SUBCOMMANDS, skipping global options like `-chdir=…`.
 * Outside a cloudsesame project, `cloudsesame auth --` runs the command directly.
 */
export function shellInit(shell: (typeof SHELLS)[number], names: string[]): string {
  const subs = CLOUD_SUBCOMMANDS;
  const header = `# cloudsesame: check your clouds before ${names.join(", ")} (https://nexihealth.github.io/cloudsesame/guide/shell)`;
  const fns = names.map((name) => {
    switch (shell) {
      case "fish":
        return [
          `function ${name}`,
          "  for a in $argv",
          "    switch $a",
          "      case '-*'",
          "        continue",
          `      case ${subs.join(" ")}`,
          `        cloudsesame auth -- ${name} $argv`,
          "        return $status",
          "    end",
          "    break",
          "  end",
          `  command ${name} $argv`,
          "end",
        ].join("\n");
      case "pwsh":
      case "powershell":
        return [
          `function ${name} {`,
          `  $sub = @($args | Where-Object { -not "$_".StartsWith('-') })[0]`,
          `  if (@(${subs.map((s) => `'${s}'`).join(", ")}) -contains $sub) { cloudsesame auth -- ${name} @args }`,
          `  else { & (Get-Command ${name} -CommandType Application)[0] @args }`,
          "}",
        ].join("\n");
      default:
        return [
          `${name}() {`,
          "  local a",
          '  for a in "$@"; do',
          '    case "$a" in',
          "      -*) continue ;;",
          `      ${subs.join("|")}) cloudsesame auth -- ${name} "$@"; return ;;`,
          "    esac",
          "    break",
          "  done",
          `  command ${name} "$@"`,
          "}",
        ].join("\n");
    }
  });
  return [header, ...fns].join("\n");
}

export const shellInitCommand: Command = {
  usage: "shell-init <shell> [commands...]",
  description: "Print shell functions so `tofu plan` checks your clouds first (bash, zsh, fish, pwsh)",
  plain({ args, command }) {
    if (command) throw new UsageError("shell-init doesn't run a command after --");
    const [shell, ...names] = args;
    if (!shell || !(SHELLS as readonly string[]).includes(shell)) {
      throw new UsageError(`shell-init needs a shell: ${SHELLS.join(", ")}. E.g. add \`eval "$(cloudsesame shell-init zsh)"\` to ~/.zshrc`);
    }
    const bad = names.find((n) => !/^[\w.-]+$/.test(n));
    if (bad) throw new UsageError(`Not a command name: ${bad}`);
    console.log(shellInit(shell as (typeof SHELLS)[number], names.length > 0 ? names : ["tofu", "terraform"]));
    return ExitCode.Ok;
  },
  async ink(ctx) {
    return this.plain(ctx) as number;
  },
};
