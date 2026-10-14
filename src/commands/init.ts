import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "../command";
import { CONFIG_FILES } from "../core/config/load";
import { defaultDeps } from "../core/deps";
import { formatCommand } from "../core/exec";
import { ExitCode } from "../core/exit";
import { detectConfig, renderConfig, SKILL_SOURCE, skillInstallCommand } from "../core/init";
import { PlainUi } from "../ui/plain";

export const init: Command = {
  usage: "init",
  description: "Create sesame.config.ts from your installed CLIs (--json for sesame.config.json)",
  async plain({ cwd, flags, interactive }) {
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

    await offerSkill(interactive && !flags.json);
    return ExitCode.Ok;
  },
  ink(ctx) {
    return Promise.resolve(this.plain(ctx));
  },
};

/** Offer to install the Agent Skill through the `skills` CLI, which handles agent selection and updates. */
async function offerSkill(interactive: boolean) {
  const command = skillInstallCommand(defaultDeps.which);
  const display = command ? formatCommand(command) : `npx skills add ${SKILL_SOURCE}`;
  if (!interactive || !command) {
    console.log(`  Agents: install the cloudsesame skill with \`${display}\`.`);
    return;
  }

  const ui = new PlainUi();
  const answer = await ui.choose("Install the cloudsesame skill for your coding agents?", [
    { value: "yes", label: "Yes", key: "y", hint: display },
    { value: "no", label: "No", key: "n" },
  ]);
  if (answer === "no") return;
  const code = await ui.handOff(command);
  if (code !== 0) console.error(`✖ skills exited with ${code}. Install later with \`${display}\`.`);
}
