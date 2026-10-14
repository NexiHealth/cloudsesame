import type { Command } from "../../command";
import { check as runCheck, exitCode } from "../../core/check";
import { formatCommand, statusTitle, symbols } from "../../ui/format";
import { prepare } from "./shared";

export const check: Command = {
  usage: "check [providers|groups...]",
  description: "Report connectivity and login status; never prompts",
  async plain(ctx) {
    const { config, targets } = await prepare(ctx);
    const report = await runCheck(config, targets);

    if (ctx.flags.json) {
      console.log(JSON.stringify({ ok: exitCode(report) === 0, ...report }, null, 2));
      return exitCode(report);
    }

    if (report.online !== null) console.log(report.online ? "✔ online" : "✖ offline");
    for (const s of report.results) {
      const detail = [s.identity, s.message].filter(Boolean).join(": ");
      console.log(`${symbols[s.state]} ${statusTitle(s)}${detail ? `  ${detail}` : ""}`);
      if (s.fix && s.state !== "ok") console.log(`  → ${formatCommand(s.fix)}`);
    }
    return exitCode(report);
  },
  async ink(ctx) {
    if (ctx.flags.json) return this.plain(ctx);
    return (await import("./ink")).default(ctx);
  },
};
