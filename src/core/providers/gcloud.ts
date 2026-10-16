import { homedir } from "node:os";
import { join } from "node:path";
import type { GcloudTarget } from "../config/types";
import { type CheckContext, firstLine as rawFirstLine, type Provider, type Status } from "./types";

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
  async check(target, { exec, http, readFile, env, timeout }) {
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

    // Permissions are tested with the credentials the target uses: ADC if it wants them (SDKs), else the user login.
    const token = wantAdc ? adcToken : userToken;
    if (target.permissions && target.project && token?.code === 0) {
      statuses.push(await testPermissions(http, token.stdout.trim(), target.project, target.permissions, timeout));
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

/** Which of `permissions` the token's principal holds on the project (`projects.testIamPermissions`). */
async function testPermissions(http: CheckContext["http"], token: string, project: string, permissions: string[], timeout: number): Promise<Status> {
  const res = await http(`https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(project)}:testIamPermissions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ permissions }),
    timeout,
  });
  const base = { provider: "gcloud", label: "permissions", identity: project } as const;
  // 403/404: no access to the project at all (or it doesn't exist). Google's message says which, e.g. a disabled API.
  if (res.status === 403 || res.status === 404) return { ...base, state: "denied", message: `no access to project ${project}: ${apiError(res)}` };
  if (res.status !== 200) return { ...base, state: "error", message: `testIamPermissions failed: ${apiError(res)}` };
  const granted = new Set((JSON.parse(res.body) as { permissions?: string[] }).permissions ?? []);
  const missing = permissions.filter((p) => !granted.has(p));
  return missing.length > 0 ? { ...base, state: "denied", message: `missing ${missing.join(", ")}` } : { ...base, state: "ok" };
}

function apiError(res: { status: number; body: string }): string {
  if (res.status === 0) return res.body;
  try {
    return (JSON.parse(res.body) as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
