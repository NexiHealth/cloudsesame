import { providerIds } from "./config/schema";
import type { AwsTarget, Config } from "./config/types";
import type { Deps } from "./deps";

export type Format = "ts" | "json";

export const SCHEMA_URL = "https://unpkg.com/cloudsesame/dist/schema.json";

export interface Detected {
  config: Config;
  /** AWS profiles found but not included, mentioned in a comment. */
  otherAwsProfiles: string[];
}

/** Build a starter config from the installed CLIs and their current settings. */
export async function detectConfig({ exec, which }: Pick<Deps, "exec" | "which">): Promise<Detected> {
  const found: Config = {};
  let otherAwsProfiles: string[] = [];
  const value = async (cmd: string, args: string[]) => {
    const r = await exec(cmd, args, { timeout: 15_000 });
    return r.code === 0 ? r.stdout.trim() || undefined : undefined;
  };

  await Promise.all([
    which("gcloud") &&
      value("gcloud", ["config", "get-value", "project", "--quiet"]).then((project) => {
        found.gcloud = { credentials: "both", ...(project && { project }) };
      }),
    which("aws") &&
      value("aws", ["configure", "list-profiles"]).then((out) => {
        const profiles = out?.split("\n").map((p) => p.trim()).filter(Boolean) ?? [];
        const env = process.env.AWS_PROFILE;
        const profile = env && profiles.includes(env) ? env : profiles.includes("default") ? "default" : profiles[0];
        found.aws = (profile ? { profile } : {}) satisfies AwsTarget;
        otherAwsProfiles = profiles.filter((p) => p !== profile);
      }),
    which("az") &&
      value("az", ["account", "show", "--query", "name", "--output", "tsv"]).then((subscription) => {
        found.az = subscription ? { subscription } : {};
      }),
  ]);
  // Stable key order regardless of which CLI answered first.
  const config: Config = {};
  for (const id of providerIds) if (found[id]) Object.assign(config, { [id]: found[id] });
  return { config, otherAwsProfiles };
}

export function renderConfig({ config, otherAwsProfiles }: Detected, format: Format): string {
  if (format === "json") return `${JSON.stringify({ $schema: SCHEMA_URL, ...config }, null, 2)}\n`;

  const body = JSON.stringify(config, null, 2).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, "$1$2:");
  const note = otherAwsProfiles.length > 0 ? `// Other AWS profiles: ${otherAwsProfiles.join(", ")} (add as aws: [{ profile: "..." }, ...])\n` : "";
  return `import type { Config } from "cloudsesame";\n\n${note}export default ${body} satisfies Config;\n`;
}
