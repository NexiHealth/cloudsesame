import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { aws } from "../src/core/providers/aws";
import type { Http } from "../src/core/http";
import { az, isAllowed } from "../src/core/providers/az";
import { adcPath, gcloud } from "../src/core/providers/gcloud";
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

  describe("quotaProject", () => {
    const adcFile = join("/gc", "application_default_credentials.json");
    const adc = (fields: object) => ({ [adcFile]: JSON.stringify({ type: "authorized_user", ...fields }) });

    test("ok when it matches", async () => {
      const { exec } = fakeExec(loggedIn);
      const statuses = await gcloud.check({ credentials: "adc", quotaProject: "billing" }, ctx(exec, adc({ quota_project_id: "billing" })));
      expect(statuses).toEqual([
        { provider: "gcloud", label: "adc", state: "ok" },
        { provider: "gcloud", label: "quota project", state: "ok", identity: "billing" },
      ]);
    });

    test("mismatch or unset suggests set-quota-project", async () => {
      const { exec } = fakeExec(loggedIn);
      const fix = ["gcloud", "auth", "application-default", "set-quota-project", "billing"];
      expect(await gcloud.check({ credentials: "adc", quotaProject: "billing" }, ctx(exec, adc({ quota_project_id: "other" })))).toMatchObject([
        { label: "adc" },
        { label: "quota project", state: "mismatch", identity: "other", fix },
      ]);
      expect(await gcloud.check({ credentials: "adc", quotaProject: "billing" }, ctx(exec, adc({})))).toMatchObject([
        { label: "adc" },
        { label: "quota project", state: "mismatch", identity: undefined, fix },
      ]);
    });

    test("not checked until adc works, nor for service accounts", async () => {
      const { exec } = fakeExec({ ...loggedIn, "gcloud auth application-default print-access-token": { code: 1, stderr: "no creds" } });
      expect(await gcloud.check({ credentials: "adc", quotaProject: "billing" }, ctx(exec))).toMatchObject([{ label: "adc", state: "unauthenticated" }]);
      const ok = fakeExec(loggedIn).exec;
      const sa = { [adcFile]: JSON.stringify({ type: "service_account" }) };
      expect(await gcloud.check({ credentials: "adc", quotaProject: "billing" }, ctx(ok, sa))).toEqual([{ provider: "gcloud", label: "adc", state: "ok" }]);
    });

    test("unreadable credentials file is an error", async () => {
      const { exec } = fakeExec(loggedIn);
      expect(await gcloud.check({ credentials: "adc", quotaProject: "billing" }, ctx(exec))).toMatchObject([
        { label: "adc" },
        { label: "quota project", state: "error", message: `can't read ${adcFile}` },
      ]);
    });

    test("adcPath", () => {
      expect(adcPath({ GOOGLE_APPLICATION_CREDENTIALS: "/key.json", CLOUDSDK_CONFIG: "/gc" })).toBe("/key.json");
      expect(adcPath({ CLOUDSDK_CONFIG: "/gc" })).toBe(adcFile);
      expect(adcPath({}, "linux", "/home/me")).toBe(join("/home/me", ".config", "gcloud", "application_default_credentials.json"));
    });
  });
});

describe("gcloud permissions", () => {
  const loggedIn = {
    "gcloud auth print-access-token": { stdout: "user-tok\n" },
    "gcloud auth application-default print-access-token": { stdout: "adc-tok\n" },
    "gcloud config get-value account": { stdout: "me@x.com\n" },
    "gcloud config get-value project": { stdout: "proj-a\n" },
  };
  const target = { project: "proj-a", permissions: ["aiplatform.endpoints.predict", "speech.recognizers.recognize"] };

  /** Fake testIamPermissions that grants `granted` and records requests. */
  function iam(granted: string[] | number) {
    const requests: Array<{ url: string; auth?: string; body?: string }> = [];
    const http: Http = async (url, init) => {
      requests.push({ url, auth: init.headers?.authorization, body: init.body });
      return typeof granted === "number"
        ? { status: granted, body: JSON.stringify({ error: { message: "Permission denied on resource project proj-a." } }) }
        : { status: 200, body: JSON.stringify(granted.length ? { permissions: granted } : {}) };
    };
    return { http, requests };
  }

  test("ok when every permission is granted; tested with the ADC token", async () => {
    const { http, requests } = iam(target.permissions);
    const statuses = await gcloud.check(target, ctx(fakeExec(loggedIn).exec, {}, http));
    expect(statuses.find((s) => s.label === "permissions")).toEqual({ provider: "gcloud", label: "permissions", state: "ok", identity: "proj-a" });
    expect(requests).toEqual([
      {
        url: "https://cloudresourcemanager.googleapis.com/v1/projects/proj-a:testIamPermissions",
        auth: "Bearer adc-tok",
        body: JSON.stringify({ permissions: target.permissions }),
      },
    ]);
  });

  test("missing permissions are denied, with no fix", async () => {
    const { http } = iam(["aiplatform.endpoints.predict"]);
    const statuses = await gcloud.check(target, ctx(fakeExec(loggedIn).exec, {}, http));
    expect(statuses.find((s) => s.label === "permissions")).toEqual({
      provider: "gcloud",
      label: "permissions",
      state: "denied",
      identity: "proj-a",
      message: "missing speech.recognizers.recognize",
    });
    // An empty response means nothing is granted.
    const none = await gcloud.check(target, ctx(fakeExec(loggedIn).exec, {}, iam([]).http));
    expect(none.find((s) => s.label === "permissions")?.message).toBe("missing aiplatform.endpoints.predict, speech.recognizers.recognize");
  });

  test("user credentials use the user token", async () => {
    const { http, requests } = iam(target.permissions);
    await gcloud.check({ ...target, credentials: "user" }, ctx(fakeExec(loggedIn).exec, {}, http));
    expect(requests[0]?.auth).toBe("Bearer user-tok");
  });

  test("no access to the project is denied; other failures are errors", async () => {
    const forbidden = await gcloud.check(target, ctx(fakeExec(loggedIn).exec, {}, iam(403).http));
    expect(forbidden.find((s) => s.label === "permissions")).toMatchObject({ state: "denied", message: "no access to project proj-a: Permission denied on resource project proj-a." });
    const broken = await gcloud.check(target, ctx(fakeExec(loggedIn).exec, {}, iam(500).http));
    expect(broken.find((s) => s.label === "permissions")).toMatchObject({ state: "error", message: "testIamPermissions failed: Permission denied on resource project proj-a." });
    const offline = await gcloud.check(target, ctx(fakeExec(loggedIn).exec));
    expect(offline.find((s) => s.label === "permissions")).toMatchObject({ state: "error", message: "testIamPermissions failed: no network in tests" });
  });

  test("not tested until the login works", async () => {
    const { http, requests } = iam(target.permissions);
    const exec = fakeExec({ ...loggedIn, "gcloud auth application-default print-access-token": { code: 1, stderr: "no creds" } }).exec;
    const statuses = await gcloud.check(target, ctx(exec, {}, http));
    expect(statuses.some((s) => s.label === "permissions")).toBe(false);
    expect(requests).toEqual([]);
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

  test("unknown profile offers to create it with aws configure sso", async () => {
    const { exec, calls } = fakeExec({ "aws sts get-caller-identity": { code: 255, stderr: "\nThe config profile (dev) could not be found\n" } });
    const [s] = await aws.check({ profile: "dev" }, ctx(exec));
    expect(s).toMatchObject({ state: "error", message: "The config profile (dev) could not be found", fix: ["aws", "configure", "sso", "--profile", "dev"] });
    expect(calls).toHaveLength(1);
  });

  test("unknown AWS_PROFILE offers to create that profile", async () => {
    const previous = process.env.AWS_PROFILE;
    process.env.AWS_PROFILE = "from-env";
    try {
      const { exec } = fakeExec({ "aws sts get-caller-identity": { code: 255, stderr: "The config profile (from-env) could not be found" } });
      const [s] = await aws.check({}, ctx(exec));
      expect(s).toMatchObject({ label: "from-env", fix: ["aws", "configure", "sso", "--profile", "from-env"] });
    } finally {
      if (previous === undefined) delete process.env.AWS_PROFILE;
      else process.env.AWS_PROFILE = previous;
    }
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

describe("az permissions", () => {
  const account = { stdout: JSON.stringify({ id: "sub-1", name: "Prod", tenantId: "t-1", user: { name: "me@x.com" } }) };
  const contributor = { actions: ["*"], notActions: ["Microsoft.Authorization/*/Write"], dataActions: [], notDataActions: [] };
  const openAiUser = { actions: [], notActions: [], dataActions: ["Microsoft.CognitiveServices/accounts/OpenAI/*"], notDataActions: [] };
  const chat = "Microsoft.CognitiveServices/accounts/OpenAI/deployments/chat/completions/action";

  const world = (value: object[], extra: Record<string, { code?: number; stdout?: string; stderr?: string }> = {}) =>
    fakeExec({ "az account show": account, "az account get-access-token": { stdout: "" }, "az rest": { stdout: JSON.stringify({ value }) }, ...extra });

  test("ok when allowed at the subscription by default", async () => {
    const { exec, calls } = world([contributor, openAiUser]);
    const statuses = await az.check({ actions: ["Microsoft.Storage/storageAccounts/read"], dataActions: [chat] }, ctx(exec));
    expect(statuses).toEqual([
      { provider: "az", label: "account", state: "ok", identity: "me@x.com" },
      { provider: "az", label: "permissions", state: "ok", identity: "/subscriptions/sub-1" },
    ]);
    expect(calls).toContain("az rest --method get --url /subscriptions/sub-1/providers/Microsoft.Authorization/permissions?api-version=2022-04-01 --output json --only-show-errors");
  });

  test("missing permissions are denied at a custom scope", async () => {
    const scope = "/subscriptions/sub-1/resourceGroups/ai";
    const { exec, calls } = world([contributor]);
    const [, s] = await az.check({ actions: ["Microsoft.Authorization/roleAssignments/write"], dataActions: [chat], permissionScope: scope }, ctx(exec));
    expect(s).toEqual({
      provider: "az",
      label: "permissions",
      state: "denied",
      identity: scope,
      message: `missing Microsoft.Authorization/roleAssignments/write, ${chat}`,
    });
    expect(calls.some((c) => c.includes(`--url ${scope}/providers/Microsoft.Authorization/permissions`))).toBe(true);
  });

  test("follows nextLink", async () => {
    let page = 0;
    const base = world([]).exec;
    const exec = async (cmd: string, args: string[]) => {
      if (args[0] !== "rest") return base(cmd, args);
      page++;
      return page === 1
        ? { code: 0, stderr: "", stdout: JSON.stringify({ value: [], nextLink: "https://management.azure.com/next" }) }
        : { code: 0, stderr: "", stdout: JSON.stringify({ value: [openAiUser] }) };
    };
    const [, s] = await az.check({ dataActions: [chat] }, ctx(exec));
    expect([s?.state, page]).toEqual(["ok", 2]);
  });

  test("forbidden scope is denied; other failures are errors", async () => {
    const forbidden = world([], { "az rest": { code: 1, stderr: "ERROR: (AuthorizationFailed) The client does not have authorization" } });
    expect((await az.check({ dataActions: [chat] }, ctx(forbidden.exec)))[1]).toMatchObject({ state: "denied", message: "no access to /subscriptions/sub-1" });
    const broken = world([], { "az rest": { code: 1, stderr: "ERROR: Connection reset" } });
    expect((await az.check({ dataActions: [chat] }, ctx(broken.exec)))[1]).toMatchObject({ state: "error", message: "Connection reset" });
  });

  test("not checked while the subscription is wrong", async () => {
    const { exec, calls } = world([contributor]);
    expect(await az.check({ subscription: "Dev", dataActions: [chat] }, ctx(exec))).toHaveLength(1);
    expect(calls.some((c) => c.startsWith("az rest"))).toBe(false);
  });

  test("isAllowed: wildcards, case, notActions within the same role", () => {
    expect(isAllowed([contributor], "Microsoft.Compute/virtualMachines/start/action")).toBe(true);
    expect(isAllowed([contributor], "microsoft.authorization/roleAssignments/write")).toBe(false);
    expect(isAllowed([contributor, { actions: ["Microsoft.Authorization/roleAssignments/*"] }], "Microsoft.Authorization/roleAssignments/write")).toBe(true);
    expect(isAllowed([contributor], chat, true)).toBe(false); // actions don't grant data actions
    expect(isAllowed([openAiUser], chat, true)).toBe(true);
    expect(isAllowed([openAiUser], chat)).toBe(false); // nor the other way round
    expect(isAllowed([{ dataActions: ["*"], notDataActions: [chat] }], chat, true)).toBe(false);
    expect(isAllowed([{ actions: ["Microsoft.Storage/*/read"] }], "Microsoft.Storage/storageAccounts/blobServices/read")).toBe(true);
  });
});
