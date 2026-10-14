import { describe, expect, test } from "bun:test";
import { aws } from "../src/core/providers/aws";
import { az } from "../src/core/providers/az";
import { gcloud } from "../src/core/providers/gcloud";
import { ctx, fakeExec } from "./helpers";

describe("gcloud", () => {
  const loggedIn = {
    "gcloud auth print-access-token": { stdout: "tok" },
    "gcloud auth application-default print-access-token": { stdout: "tok" },
    "gcloud config get-value account": { stdout: "me@x.com\n" },
    "gcloud config get-value project": { stdout: "proj-a\n" },
  };

  test("ok for user + adc by default", async () => {
    const { exec } = fakeExec(loggedIn);
    expect(await gcloud.check({}, ctx(exec))).toEqual([
      { provider: "gcloud", label: "user", state: "ok", identity: "me@x.com" },
      { provider: "gcloud", label: "adc", state: "ok" },
    ]);
  });

  test("expired user login suggests login --update-adc", async () => {
    const { exec } = fakeExec({ ...loggedIn, "gcloud auth print-access-token": { code: 1, stderr: "ERROR: (gcloud.auth.print-access-token) Reauthentication failed.\n" } });
    const [user] = await gcloud.check({}, ctx(exec));
    expect(user).toMatchObject({ state: "unauthenticated", message: "reauthentication required", fix: ["gcloud", "auth", "login", "--update-adc"] });
  });

  test("adc only skips the user token", async () => {
    const { exec, calls } = fakeExec(loggedIn);
    expect(await gcloud.check({ credentials: "adc" }, ctx(exec))).toEqual([{ provider: "gcloud", label: "adc", state: "ok" }]);
    expect(calls.some((c) => c.startsWith("gcloud auth print-access-token"))).toBe(false);
  });

  test("account and project mismatches", async () => {
    const { exec } = fakeExec(loggedIn);
    const statuses = await gcloud.check({ credentials: "user", account: "other@x.com", project: "proj-b" }, ctx(exec));
    expect(statuses).toMatchObject([
      { label: "user", state: "mismatch", fix: ["gcloud", "auth", "login", "other@x.com"] },
      { label: "project", state: "mismatch", identity: "proj-a", fix: ["gcloud", "config", "set", "project", "proj-b"] },
    ]);
  });
});

describe("aws", () => {
  const identity = { stdout: JSON.stringify({ Account: "123456789012", Arn: "arn:aws:sts::123456789012:assumed-role/Admin/me" }) };

  test("ok with identity", async () => {
    const { exec, calls } = fakeExec({ "aws sts get-caller-identity": identity });
    expect(await aws.check({ profile: "dev" }, ctx(exec))).toEqual([
      { provider: "aws", label: "dev", state: "ok", identity: "arn:aws:sts::123456789012:assumed-role/Admin/me" },
    ]);
    expect(calls[0]).toBe("aws sts get-caller-identity --output json --profile dev");
  });

  test("account mismatch", async () => {
    const { exec } = fakeExec({ "aws sts get-caller-identity": identity });
    const [s] = await aws.check({ accountId: "999999999999" }, ctx(exec));
    expect(s).toMatchObject({ state: "mismatch", message: "expected account 999999999999, got 123456789012" });
  });

  const expired = { "aws sts get-caller-identity": { code: 255, stderr: "\naws: [ERROR]: Token has expired\n" } };

  test("expired SSO profile suggests aws sso login", async () => {
    const { exec } = fakeExec({ ...expired, "aws configure get sso_session": { stdout: "corp\n" } });
    const [s] = await aws.check({ profile: "dev" }, ctx(exec));
    expect(s).toMatchObject({ state: "unauthenticated", message: "Token has expired", fix: ["aws", "sso", "login", "--profile", "dev"] });
  });

  test("expired console-login profile suggests aws login", async () => {
    const { exec } = fakeExec({ ...expired, "aws configure get login_session": { stdout: "arn:...\n" } });
    const [s] = await aws.check({}, ctx(exec));
    expect(s).toMatchObject({ fix: ["aws", "login"] });
  });

  test("static credentials have no login fix", async () => {
    const { exec } = fakeExec(expired);
    const [s] = await aws.check({ profile: "keys" }, ctx(exec));
    expect(s?.fix).toBeUndefined();
    expect(s?.message).toContain("aws configure sso");
  });
});

describe("az", () => {
  const account = { stdout: JSON.stringify({ id: "sub-1", name: "Prod", tenantId: "t-1", user: { name: "me@x.com" } }) };
  const token = { stdout: "" };

  test("ok", async () => {
    const { exec } = fakeExec({ "az account show": account, "az account get-access-token": token });
    expect(await az.check({}, ctx(exec))).toEqual([{ provider: "az", label: "account", state: "ok", identity: "me@x.com" }]);
  });

  test("expired token suggests az login --tenant", async () => {
    const { exec } = fakeExec({ "az account show": account, "az account get-access-token": { code: 1, stderr: "ERROR: AADSTS70043: expired" } });
    const [s] = await az.check({ tenant: "t-1" }, ctx(exec));
    expect(s).toMatchObject({ state: "unauthenticated", fix: ["az", "login", "--tenant", "t-1"] });
  });

  test("subscription mismatch suggests az account set", async () => {
    const { exec } = fakeExec({ "az account show": account, "az account get-access-token": token });
    const [s] = await az.check({ subscription: "Dev" }, ctx(exec));
    expect(s).toMatchObject({ state: "mismatch", fix: ["az", "account", "set", "--subscription", "Dev"] });
  });
});
