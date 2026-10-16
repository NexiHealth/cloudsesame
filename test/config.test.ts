import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, findConfig, loadConfig } from "../src/core/config/load";

const root = mkdtempSync(join(tmpdir(), "sesame-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function project(name: string, files: Record<string, string>) {
  const dir = join(root, name);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

describe("config", () => {
  test("finds the nearest config walking up", () => {
    const dir = project("nearest", { ".git/HEAD": "", "sesame.config.json": "{}", "infra/sesame.config.json": "{}", "infra/envs/dev/x": "" });
    expect(findConfig(join(dir, "infra/envs/dev"))).toBe(join(dir, "infra/sesame.config.json"));
  });

  test("stops at the git root", () => {
    const parent = project("outer", { "sesame.config.json": "{}", "repo/.git/HEAD": "", "repo/src/x": "" });
    expect(findConfig(join(parent, "repo/src"))).toBeUndefined();
  });

  test("loads and normalises a TS config", async () => {
    const dir = project("ts", { ".git/HEAD": "", "sesame.config.ts": 'export default { aws: { profile: "dev" } } satisfies object;' });
    expect(await loadConfig({ cwd: dir })).toEqual({ config: { aws: [{ profile: "dev" }] }, path: join(dir, "sesame.config.ts") });
  });

  test("rejects invalid config with field paths", async () => {
    const dir = project("invalid", { ".git/HEAD": "", "sesame.config.json": '{ "aws": { "accountId": "1" }, "typo": true }' });
    const error = await loadConfig({ cwd: dir }).catch((e) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain("aws[0].accountId");
    expect(error.message).toContain('"typo"');
  });

  test("quotaProject needs ADC credentials", async () => {
    const dir = project("quota", { ".git/HEAD": "", "sesame.config.json": '{ "gcloud": { "credentials": "user", "quotaProject": "billing" } }' });
    const error = await loadConfig({ cwd: dir }).catch((e) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain("gcloud[0].quotaProject");
  });

  test("permissions: gcloud needs project; names are validated", async () => {
    const load = async (json: object) => loadConfig({ cwd: project(`perm-${Math.random()}`, { ".git/HEAD": "", "sesame.config.json": JSON.stringify(json) }) }).catch((e) => e);
    expect((await load({ gcloud: { permissions: ["aiplatform.endpoints.predict"] } })).message).toContain("gcloud[0].permissions");
    expect((await load({ gcloud: { project: "p", permissions: ["aiplatform.predict"] } })).message).toContain("gcloud[0].permissions[0]");
    expect((await load({ gcloud: { project: "p", permissions: [] } })).message).toContain("gcloud[0].permissions");
    expect((await load({ az: { permissionScope: "/subscriptions/s" } })).message).toContain("az[0].permissionScope");
    expect((await load({ az: { actions: ["Microsoft.Storage/storageAccounts/read"], permissionScope: "rg" } })).message).toContain("az[0].permissionScope");
    expect((await load({ az: { dataActions: ["read"] } })).message).toContain("az[0].dataActions[0]");
    expect((await load({ aws: { permissions: ["bedrock:InvokeModel"] } })).message).toContain('"permissions"');
    const ok = await load({ gcloud: { project: "p", permissions: ["aiplatform.endpoints.predict"] }, az: { actions: ["Microsoft.Storage/storageAccounts/read"], permissionScope: "/subscriptions/s/resourceGroups/rg" } });
    expect(ok.config.gcloud[0].permissions).toEqual(["aiplatform.endpoints.predict"]);
  });

  test("no config is an empty config", async () => {
    expect(await loadConfig({ cwd: project("none", { ".git/HEAD": "" }) })).toEqual({ config: {} });
  });
});
