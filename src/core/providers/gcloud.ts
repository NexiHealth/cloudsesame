import type { GcloudTarget } from "../config/types";
import { firstLine as rawFirstLine, type Provider, type Status } from "./types";

const firstLine = (stderr: string) => (/reauthentication/i.test(stderr) ? "reauthentication required" : rawFirstLine(stderr));

export const gcloud: Provider<GcloudTarget> = {
  id: "gcloud",
  cli: "gcloud",
  install: "https://cloud.google.com/sdk/docs/install",
  async check(target, { exec, timeout }) {
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
