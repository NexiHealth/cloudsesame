import type { AwsTarget } from "../config/types";
import { firstLine, type Provider, type Status } from "./types";

export const aws: Provider<AwsTarget> = {
  id: "aws",
  cli: "aws",
  install: "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
  async check(target, { exec, timeout }) {
    const label = target.profile ?? process.env.AWS_PROFILE ?? "default";
    const profileArgs = target.profile ? ["--profile", target.profile] : [];
    const run = (...args: string[]) => exec("aws", [...args, ...profileArgs], { timeout, env: { AWS_PAGER: "" } });

    const identity = await run("sts", "get-caller-identity", "--output", "json");

    if (identity.code === 0) {
      const { Account, Arn } = JSON.parse(identity.stdout) as { Account: string; Arn: string };
      const status: Status = { provider: "aws", label, state: "ok", identity: Arn };
      return [target.accountId && Account !== target.accountId ? { ...status, state: "mismatch", message: `expected account ${target.accountId}, got ${Account}` } : status];
    }

    const message = firstLine(identity.stderr);
    // The profile doesn't exist yet: offer to create it (`aws configure sso` signs in at the end).
    if (/could not be found/i.test(message)) return [{ provider: "aws", label, state: "error", message, fix: ["aws", "configure", "sso", "--profile", label] }];

    // Pick the login flow the profile is configured for.
    const [ssoSession, ssoStartUrl, loginSession] = await Promise.all(
      ["sso_session", "sso_start_url", "login_session"].map((key) => run("configure", "get", key)),
    );
    const has = (r: typeof ssoSession) => r?.code === 0 && r.stdout.trim() !== "";
    const fix = has(ssoSession) || has(ssoStartUrl) ? ["aws", "sso", "login", ...profileArgs] : has(loginSession) ? ["aws", "login", ...profileArgs] : undefined;

    return [
      {
        provider: "aws",
        label,
        state: "unauthenticated",
        message: fix ? message : `${message} (no SSO or console login configured; see \`aws configure sso\`)`,
        fix,
      },
    ];
  },
};
