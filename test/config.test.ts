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

  test("no config is an empty config", async () => {
    expect(await loadConfig({ cwd: project("none", { ".git/HEAD": "" }) })).toEqual({ config: {} });
  });
});
