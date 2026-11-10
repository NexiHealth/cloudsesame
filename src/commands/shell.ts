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
  const checked = await check("auth", ctx, ink);
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
