import { homedir } from "node:os";
import { join } from "node:path";
import type { GcloudTarget } from "../config/types";
import { firstLine as rawFirstLine, type Provider, type Status } from "./types";

const firstLine = (stderr: string) => (/reauthentication/i.test(stderr) ? "reauthentication required" : rawFirstLine(stderr));

/** Where SDKs find Application Default Credentials: `GOOGLE_APPLICATION_CREDENTIALS`, else gcloud's config dir. */
export function adcPath(env: NodeJS.ProcessEnv, platform = process.platform, home = homedir()): string {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return env.GOOGLE_APPLICATION_CREDENTIALS;
  const dir = env.CLOUDSDK_CONFIG ?? (platform === "win32" ? join(env.APPDATA ?? home, "gcloud") : join(home, ".config", "gcloud"));
  return join(dir, "application_default_credentials.json");
}

function parseJson(text: string | undefined): Record<string, unknown> | undefined {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

export const gcloud: Provider<GcloudTarget> = {
  id: "gcloud",
  cli: "gcloud",
  install: "https://cloud.google.com/sdk/docs/install",
  async check(target, { exec, readFile, env, timeout }) {
    const credentials = target.credentials ?? "both";
    const wantUser = credentials !== "adc";
    const wantAdc = credentials !== "user";
    const run = (...args: string[]) => exec("gcloud", [...args, "--quiet"], { timeout });

    const [userToken, adcToken, account, project] = await Promise.all([
      wantUser ? run("auth", "print-access-token") : undefined,
      wantAdc ? run("auth", "application-default", "print-access-token") : undefined,
      run("config", "get-value", "account"),
      target.project ? run("config", "get-value", "project") : undefined,
    ]);
    const activeAccount = account.stdout.trim() || undefined;
    const statuses: Status[] = [];

    if (userToken) {
      const login = ["gcloud", "auth", "login", ...(target.account ? [target.account] : []), ...(wantAdc ? ["--update-adc"] : [])];
      if (userToken.code !== 0) {
        statuses.push({ provider: "gcloud", label: "user", state: "unauthenticated", identity: activeAccount, message: firstLine(userToken.stderr), fix: login });
      } else if (target.account && activeAccount !== target.account) {
        statuses.push({ provider: "gcloud", label: "user", state: "mismatch", identity: activeAccount, message: `expected account ${target.account}`, fix: login });
      } else {
        statuses.push({ provider: "gcloud", label: "user", state: "ok", identity: activeAccount });
      }
    }

    if (adcToken) {
      statuses.push(
        adcToken.code === 0
          ? { provider: "gcloud", label: "adc", state: "ok" }
          : { provider: "gcloud", label: "adc", state: "unauthenticated", message: firstLine(adcToken.stderr), fix: ["gcloud", "auth", "application-default", "login"] },
      );
    }

    // Only meaningful once ADC works; a failed ADC login is fixed first.
    if (adcToken?.code === 0 && target.quotaProject) {
      const path = adcPath(env);
      const adc = parseJson(await readFile(path));
      const fix = ["gcloud", "auth", "application-default", "set-quota-project", target.quotaProject];
      const active = typeof adc?.quota_project_id === "string" ? adc.quota_project_id : undefined;
      if (!adc) {
        statuses.push({ provider: "gcloud", label: "quota project", state: "error", message: `can't read ${path}` });
      } else if (adc.type === "authorized_user" && active !== target.quotaProject) {
        statuses.push({ provider: "gcloud", label: "quota project", state: "mismatch", identity: active, message: `expected quota project ${target.quotaProject}`, fix });
      } else if (adc.type === "authorized_user") {
        statuses.push({ provider: "gcloud", label: "quota project", state: "ok", identity: active });
      }
    }

    if (project && target.project) {
      const active = project.stdout.trim() || undefined;
      statuses.push(
        active === target.project
          ? { provider: "gcloud", label: "project", state: "ok", identity: active }
          : { provider: "gcloud", label: "project", state: "mismatch", identity: active, message: `expected project ${target.project}`, fix: ["gcloud", "config", "set", "project", target.project] },
      );
    }

    return statuses;
  },
};
