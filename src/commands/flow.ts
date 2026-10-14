import type { Command, Context } from "../command";
import { loadConfig } from "../core/config/load";
import { type Mode, resolvePolicies } from "../core/flow/policy";
import { runFlow } from "../core/flow/run";
import type { FlowOptions, FlowResult } from "../core/flow/types";
import { resolveTargets } from "../core/targets";
import { PlainUi } from "../ui/plain";

async function prepare(mode: Mode, ctx: Context): Promise<FlowOptions> {
  const { config } = await loadConfig({ cwd: ctx.cwd, path: ctx.flags.config });
  return {
    config,
    targets: resolveTargets(config, ctx.args),
    policies: resolvePolicies(mode, config, ctx.flags),
    // JSON output is for scripts: never prompt.
    interactive: ctx.interactive && !ctx.flags.json,
  };
}

function finish(ctx: Context, result: FlowResult): number {
  if (ctx.flags.json) console.log(JSON.stringify({ ok: result.code === 0, ...result }, null, 2));
  return result.code;
}

/** check, auth and predev share one flow; they differ in policies (see resolvePolicies). */
export function flowCommand(mode: Mode, meta: Pick<Command, "usage" | "description">): Command {
  return {
    ...meta,
    async plain(ctx) {
      const opts = await prepare(mode, ctx);
      return finish(ctx, await runFlow(opts, new PlainUi({ silent: ctx.flags.json })));
    },
    async ink(ctx) {
      if (ctx.flags.json) return this.plain(ctx);
      const opts = await prepare(mode, ctx);
      const { runFlowInk } = await import("../ui/ink/flow");
      return finish(ctx, await runFlowInk(opts, ctx.flags.animation ?? opts.config.animation));
    },
  };
}
