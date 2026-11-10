import type { Command, Context } from "../command";
import { commandEnv } from "../core/check";
import { loadConfig } from "../core/config/load";
import { defaultDeps } from "../core/deps";
import { execInteractive } from "../core/exec";
import { ExitCode } from "../core/exit";
import { type Mode, resolvePolicies } from "../core/flow/policy";
import { runFlow } from "../core/flow/run";
import type { FlowOptions, FlowResult } from "../core/flow/types";
import { resolveTargets } from "../core/targets";
import { PlainUi } from "../ui/plain";

export interface Checked {
  opts: FlowOptions;
  result: FlowResult;
}

async function prepare(mode: Mode, ctx: Context): Promise<{ opts: FlowOptions; configured: boolean }> {
  const { config, path } = await loadConfig({ cwd: ctx.cwd, path: ctx.flags.config });
  const opts = {
    config,
    targets: resolveTargets(config, ctx.args),
    policies: resolvePolicies(mode, config, ctx.flags),
    // JSON output is for scripts: never prompt.
    interactive: ctx.interactive && !ctx.flags.json,
  };
  return { opts, configured: !!path };
}

/**
 * The check flow, in the front end `ctx` asks for. Undefined when there's nothing to check: a command after `--`
 * in a project without a config, which then runs as is (the `shell-init` wrappers rely on this outside projects).
 */
export async function check(mode: Mode, ctx: Context, ink: boolean): Promise<Checked | undefined> {
  const { opts, configured } = await prepare(mode, ctx);
  if (ctx.command && !configured && ctx.args.length === 0) return undefined;
  if (!ink || ctx.flags.json) return { opts, result: await runFlow(opts, new PlainUi({ silent: ctx.flags.json, stderr: ctx.stderr })) };
  const { runFlowInk } = await import("../ui/ink/flow");
  return { opts, result: await runFlowInk(opts, ctx.flags.animation ?? opts.config.animation, { stderr: ctx.stderr }) };
}

/** Environment the ready targets provide to other tools (`CLOUDFLARE_API_TOKEN` from the cf login). */
export const providedEnv = ({ opts }: Checked) => commandEnv(opts.targets, defaultDeps, opts.config.timeout ?? 20_000);

async function finish(ctx: Context, checked: Checked | undefined): Promise<number> {
  if (!checked) return execInteractive(ctx.command!);
  const { result } = checked;
  if (ctx.flags.json) console.log(JSON.stringify({ ok: result.code === 0, ...result }, null, 2));
  if (!ctx.command || result.code !== ExitCode.Ok) return result.code;
  // The terminal is free again (Ink has exited): hand it to the command, with what the providers provide.
  return execInteractive(ctx.command, await providedEnv(checked));
}

/** check, auth and predev share one flow; they differ in policies (see resolvePolicies). */
export function flowCommand(mode: Mode, meta: Pick<Command, "usage" | "description">): Command {
  return {
    ...meta,
    async plain(ctx) {
      return finish(ctx, await check(mode, ctx, false));
    },
    async ink(ctx) {
      return finish(ctx, await check(mode, ctx, true));
    },
  };
}
