import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "../command";
import { CONFIG_FILES } from "../core/config/load";
import { defaultDeps } from "../core/deps";
import { ExitCode } from "../core/exit";
import { detectConfig, renderConfig } from "../core/init";

export const init: Command = {
  usage: "init",
  description: "Create sesame.config.ts from your installed CLIs (--json for sesame.config.json)",
  async plain({ cwd, flags }) {
    const existing = CONFIG_FILES.map((f) => join(cwd, f)).find((f) => existsSync(f));
    if (existing && !flags.force) {
      console.error(`✖ ${existing} already exists (use --force to overwrite)`);
      return ExitCode.Usage;
    }

    const format = flags.json ? "json" : "ts";
    const file = join(cwd, `sesame.config.${format}`);
    const detected = await detectConfig(defaultDeps);
    writeFileSync(file, renderConfig(detected, format));

    const providers = Object.keys(detected.config);
    console.log(`✔ Created ${file}${providers.length ? ` (${providers.join(", ")})` : " (no cloud CLIs found)"}`);
    console.log(`  Next: add "predev": "cloudsesame predev" to package.json, or run \`cloudsesame\` before infra commands.`);
    return ExitCode.Ok;
  },
  ink(ctx) {
    return Promise.resolve(this.plain(ctx));
  },
};
