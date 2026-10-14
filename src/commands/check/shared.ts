import type { Context } from "../../command";
import { resolveTargets } from "../../core/check";
import { loadConfig } from "../../core/config/load";

export async function prepare(ctx: Context) {
  const { config } = await loadConfig({ cwd: ctx.cwd, path: ctx.flags.config });
  return { config, targets: resolveTargets(config, ctx.args) };
}
