import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { aws } from "../src/core/providers/aws";
import type { Http } from "../src/core/http";
import { az, isAllowed } from "../src/core/providers/az";
import { cfCommand, cloudflare, installBun } from "../src/core/providers/cloudflare";
import { wrangler } from "../src/core/providers/wrangler";
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

describe("cloudflare", () => {
  const ACCOUNT = "0123456789abcdef0123456789abcdef";
  /** Fake Cloudflare API: `routes` maps a path prefix (after /client/v4) to [status, result]. */
  function api(routes: Record<string, [number, unknown]>) {
    const requests: Array<{ path: string; auth?: string }> = [];
    const http: Http = async (url, init) => {
      const path = url.replace("https://api.cloudflare.com/client/v4", "");
      requests.push({ path, auth: init.headers?.authorization });
      const key = Object.keys(routes).filter((k) => path.startsWith(k)).sort((a, b) => b.length - a.length)[0];
      if (!key) return { status: 404, body: JSON.stringify({ success: false, errors: [{ code: 7003, message: "No route" }] }) };
      const [status, result] = routes[key]!;
      return { status, body: JSON.stringify(status === 200 ? { success: true, errors: [], result } : { success: false, errors: [{ code: 1000, message: result }] }) };
    };
    return { http, requests };
  }
  const run = (target: Parameters<typeof cloudflare.check>[0], http: Http, env: Record<string, string> = { CLOUDFLARE_API_TOKEN: "tok" }) =>
    cloudflare.check(target, { ...ctx(fakeExec({}).exec, {}, http), env });
  const active = { "/user/tokens/verify": [200, { id: "t", status: "active" }] } as Record<string, [number, unknown]>;

  describe("cf login (no CLOUDFLARE_API_TOKEN)", () => {
    const FILE = "/home/me/.config/cloudflare/config/default.json";
    const whoami = (fields: object) => ({ "cf auth whoami": { stdout: JSON.stringify(fields) } });
    const loggedIn = { authenticated: true, authSource: `OAuth token from ${FILE}`, tokenValid: true, email: "me@acme.dev", accounts: [{ id: ACCOUNT, name: "Acme" }] };
    const file = { [FILE]: JSON.stringify({ oauth_token: "oauth", refresh_token: "r", expiration_time: "2099-01-01T00:00:00Z" }) };
    const withCf = (exec: ReturnType<typeof fakeExec>["exec"], files: Record<string, string> = file, http: Http = api(active).http, which: (c: string) => string | undefined = (c) => (c === "cf" ? "/bin/cf" : undefined)) => ({
      ...ctx(exec, files, http),
      which,
      env: {},
    });

    test("ok: identity is the email; env hands the OAuth token to commands", async () => {
      const target = {};
      const c = withCf(fakeExec(whoami(loggedIn)).exec);
      expect(await cloudflare.check(target, c)).toEqual([{ provider: "cloudflare", label: "login", state: "ok", identity: "me@acme.dev" }]);
      expect(await cloudflare.env!(target, c)).toEqual({ CLOUDFLARE_API_TOKEN: "oauth" });
    });

    test("not logged in offers cf auth login; an expired login, --force", async () => {
      const out = await cloudflare.check({}, withCf(fakeExec(whoami({ authenticated: false, error: "Not logged in" })).exec));
      expect(out).toEqual([{ provider: "cloudflare", label: "login", state: "unauthenticated", message: "not logged in", fix: ["cf", "auth", "login"] }]);
      const [expired] = await cloudflare.check({}, withCf(fakeExec(whoami({ ...loggedIn, tokenValid: false })).exec));
      expect(expired).toMatchObject({ state: "unauthenticated", fix: ["cf", "auth", "login", "--force"] });
    });

    test("without cf, runs it through Bun, found on PATH or in ~/.bun/bin", async () => {
      const { exec, calls } = fakeExec({ "bun x cf auth whoami": { stdout: JSON.stringify({ authenticated: false }) } });
      const [status] = await cloudflare.check({}, withCf(exec, file, api(active).http, (c) => (c === "bun" ? "/bin/bun" : undefined)));
      expect(calls).toEqual(["bun x cf auth whoami"]);
      expect(status!.fix).toEqual(["bun", "x", "cf", "auth", "login"]);
      const home = join(homedir(), ".bun", "bin", "bun");
      expect(cfCommand((c) => (c === home ? home : undefined), {})).toEqual([home, "x", "cf"]);
      expect(cfCommand((c) => (c === "/opt/bun/bin/bun" ? c : undefined), { BUN_INSTALL: "/opt/bun" })).toEqual(["/opt/bun/bin/bun", "x", "cf"]);
    });

    test("neither cf nor Bun: offers Bun's installer", async () => {
      const [status] = await cloudflare.check({}, withCf(fakeExec({}).exec, file, api(active).http, () => undefined));
      expect(status).toMatchObject({ label: "login", state: "missing", fix: installBun() });
      expect(installBun("linux")).toEqual(["bash", "-c", "curl -fsSL https://bun.sh/install | bash"]);
      expect(installBun("win32")).toEqual(["powershell", "-c", "irm bun.sh/install.ps1 | iex"]);
    });

    test("token not in the config file (OS keychain) is an error", async () => {
      const [status] = await cloudflare.check({}, withCf(fakeExec(whoami(loggedIn)).exec, { [FILE]: JSON.stringify({ scopes: [] }) }));
      expect(status).toMatchObject({ state: "error", message: expect.stringContaining("CLOUDFLARE_AUTH_USE_KEYRING=false cf auth login") });
    });

    test("accountId must be among the login's accounts", async () => {
      const [status] = await cloudflare.check({ accountId: "f".repeat(32) }, withCf(fakeExec(whoami(loggedIn)).exec));
      expect(status).toMatchObject({ state: "mismatch", fix: ["cf", "auth", "login", "--force"] });
    });

    test("zones are checked with the OAuth token", async () => {
      const { http, requests } = api({ "/zones?name=acme.dev": [200, [{ id: "z1" }]], "/zones/z1/dns_records": [403, "Authentication error"] });
      const statuses = await cloudflare.check({ zones: ["acme.dev"] }, withCf(fakeExec(whoami(loggedIn)).exec, file, http));
      expect(statuses[1]).toMatchObject({ label: "zones", state: "denied", message: "acme.dev: can't read DNS" });
      expect(requests.every((r) => r.auth === "Bearer oauth")).toBe(true);
    });
  });

  test("CLOUDFLARE_API_TOKEN set: verified instead, and passed on as is (or from tokenEnv)", async () => {
    expect(await cloudflare.env!({}, { ...ctx(fakeExec({}).exec), env: { CLOUDFLARE_API_TOKEN: "ci" } })).toEqual({ CLOUDFLARE_API_TOKEN: "ci" });
    expect(await cloudflare.env!({ tokenEnv: "CF_DNS" }, { ...ctx(fakeExec({}).exec), env: { CF_DNS: "dns" } })).toEqual({ CLOUDFLARE_API_TOKEN: "dns" });
  });

  test("valid user token, sent as a bearer token", async () => {
    const { http, requests } = api(active);
    expect(await run({}, http)).toEqual([{ provider: "cloudflare", label: "token", state: "ok", identity: "CLOUDFLARE_API_TOKEN" }]);
    expect(requests).toEqual([{ path: "/user/tokens/verify", auth: "Bearer tok" }]);
  });

  test("tokenEnv picks another variable", async () => {
    const { http, requests } = api(active);
    const [status] = await run({ tokenEnv: "CF_DNS_TOKEN" }, http, { CF_DNS_TOKEN: "dns" });
    expect(status).toMatchObject({ state: "ok", identity: "CF_DNS_TOKEN" });
    expect(requests[0]!.auth).toBe("Bearer dns");
  });

  test("invalid or expired token", async () => {
    const [invalid] = await run({}, api({ "/user/tokens/verify": [401, "Invalid API Token"] }).http);
    expect(invalid).toMatchObject({ state: "unauthenticated", message: "CLOUDFLARE_API_TOKEN is invalid: Invalid API Token (for an account-owned token, set accountId)" });
    const [expired] = await run({}, api({ "/user/tokens/verify": [200, { status: "expired" }] }).http);
    expect(expired).toMatchObject({ state: "unauthenticated", message: "CLOUDFLARE_API_TOKEN is expired" });
  });

  test("account-owned token verifies at the account", async () => {
    const { http, requests } = api({ "/user/tokens/verify": [401, "Invalid API Token"], [`/accounts/${ACCOUNT}/tokens/verify`]: [200, { status: "active" }] });
    expect(await run({ accountId: ACCOUNT }, http)).toMatchObject([{ state: "ok" }]);
    expect(requests.map((r) => r.path)).toEqual(["/user/tokens/verify", `/accounts/${ACCOUNT}/tokens/verify`]);
  });

  test("network failure is an error", async () => {
    const [status] = await run({}, async () => ({ status: 0, body: "fetch failed" }));
    expect(status).toMatchObject({ state: "error", message: "fetch failed" });
  });

  test("zones: visible with readable DNS, else denied", async () => {
    const { http, requests } = api({
      ...active,
      "/zones?name=acme.dev": [200, [{ id: "z1" }]],
      "/zones?name=other.dev": [200, []],
      "/zones?name=nodns.dev": [200, [{ id: "z3" }]],
      "/zones/z1/dns_records": [200, []],
      "/zones/z3/dns_records": [403, "Authentication error"],
    });
    expect(await run({ zones: ["acme.dev"] }, http)).toEqual([
      { provider: "cloudflare", label: "token", state: "ok", identity: "CLOUDFLARE_API_TOKEN" },
      { provider: "cloudflare", label: "zones", state: "ok", identity: "acme.dev" },
    ]);
    expect(requests.map((r) => r.path)).toContain("/zones/z1/dns_records?per_page=1");
    const [, zones] = await run({ zones: ["acme.dev", "other.dev", "nodns.dev"] }, http);
    expect(zones).toMatchObject({ state: "denied", message: "other.dev: no access, nodns.dev: can't read DNS" });
  });

  test("zones lookup narrowed to accountId", async () => {
    const { http, requests } = api({ ...active, "/zones?name=acme.dev": [200, [{ id: "z1" }]], "/zones/z1/dns_records": [200, []] });
    await run({ accountId: ACCOUNT, zones: ["acme.dev"] }, http);
    expect(requests.map((r) => r.path)).toContain(`/zones?name=acme.dev&account.id=${ACCOUNT}`);
  });
});

describe("wrangler", () => {
  const whoami = (accounts = [{ id: "acc1", name: "Acme" }], extra: object = {}) => ({
    "wrangler whoami --json": { stdout: JSON.stringify({ loggedIn: true, authType: "OAuth Token", email: "me@acme.dev", accounts, ...extra }) },
  });
  const run = (target: object, exec: ReturnType<typeof fakeExec>["exec"], env: Record<string, string> = {}) => wrangler.check(target, { ...ctx(exec), env });

  test("OAuth login ok, identity is the email", async () => {
    expect(await run({}, fakeExec(whoami()).exec)).toEqual([{ provider: "wrangler", label: "login", state: "ok", identity: "me@acme.dev" }]);
  });

  test("logged out offers wrangler login", async () => {
    const { exec } = fakeExec({ "wrangler whoami --json": { code: 1, stdout: '{"loggedIn":false}' } });
    expect(await run({}, exec)).toEqual([{ provider: "wrangler", label: "login", state: "unauthenticated", message: "not logged in", fix: ["wrangler", "login"] }]);
  });

  test("account by id or name; otherwise mismatch", async () => {
    const { exec } = fakeExec(whoami());
    expect(await run({ account: "acc1" }, exec)).toMatchObject([{ state: "ok" }]);
    expect(await run({ account: "Acme" }, exec)).toMatchObject([{ state: "ok" }]);
    expect(await run({ account: "Other" }, exec)).toMatchObject([{ state: "mismatch", message: "no access to account Other (has: Acme)", fix: ["wrangler", "login"] }]);
  });

  test("a bad CLOUDFLARE_API_TOKEN has no fix (wrangler login refuses while it's set)", async () => {
    const stderr = "\n\x1b[31m✘ \x1b[41;31m[\x1b[41;97mERROR\x1b[41;31m]\x1b[0m A request to the Cloudflare API (/user/tokens/verify) failed.\n\n  Invalid request headers [code: 6003]\n\n  If you think this is a bug, please open an issue\n";
    const { exec } = fakeExec({ "wrangler whoami --json": { code: 1, stderr } });
    expect(await run({}, exec, { CLOUDFLARE_API_TOKEN: "bad" })).toEqual([
      {
        provider: "wrangler",
        label: "token",
        state: "unauthenticated",
        message: "CLOUDFLARE_API_TOKEN: A request to the Cloudflare API (/user/tokens/verify) failed: Invalid request headers [code: 6003]",
        fix: undefined,
      },
    ]);
  });

  test("account API token: identity is the account", async () => {
    const { exec } = fakeExec(whoami([{ id: "acc1", name: "Acme" }], { authType: "Account API Token", email: undefined }));
    expect(await run({}, exec, { CLOUDFLARE_API_TOKEN: "t" })).toEqual([{ provider: "wrangler", label: "token", state: "ok", identity: "Acme" }]);
  });
});
