import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cacheKey, cachePath, cacheTtl } from "../src/core/cache";
import { configSchema } from "../src/core/config/schema";
import { runFlow } from "../src/core/flow/run";
import type { FlowOptions } from "../src/core/flow/types";
import type { Target } from "../src/core/targets";
import { deps, fakeExec, ScriptedUi } from "./helpers";

const ok = { stdout: JSON.stringify({ Account: "123456789012", Arn: "arn:me" }) };
const target: Target = { provider: "aws", target: { profile: "dev" } };

/** An in-memory cache file, a clock, and an aws that passes (or not). */
function world(awsOk = true) {
  const files: Record<string, string> = {};
  let time = 1_000_000;
  const { exec, calls } = fakeExec({ "aws sts": awsOk ? ok : { code: 255, stderr: "aws: [ERROR]: Token has expired" } });
  const d = deps({
    exec,
    online: true,
    readFile: async (p) => files[p],
    writeFile: async (p, c) => void (files[p] = c),
    now: () => time,
  });
  return { d, calls, files, tick: (ms: number) => (time += ms) };
}

const options = (cache: FlowOptions["cache"], targets = [target]): FlowOptions => ({
  config: {},
  targets,
  policies: { offline: "fail", unauthenticated: "fail", noTerminal: "fail", strict: false },
  interactive: false,
  cache,
});
const stsCalls = (calls: string[]) => calls.filter((c) => c.startsWith("aws sts")).length;

describe("check cache", () => {
  test("reuses a passing target within the TTL, without the online check", async () => {
    const w = world();
    let probes = 0;
    w.d.isOnline = async () => (probes++, true);
    await runFlow(options({ ttl: 30_000, read: true }), new ScriptedUi(), w.d);
    w.tick(10_000);
    const ui = new ScriptedUi();
    const r = await runFlow(options({ ttl: 30_000, read: true }), ui, w.d);
    expect(r.code).toBe(0);
    expect(stsCalls(w.calls)).toBe(1);
    expect(probes).toBe(1);
    expect(r.online).toBeNull();
    expect(ui.of("checked")[0]?.cached).toBe(true);
    expect(r.results.every((s) => s.cached)).toBe(true);
  });

  test("expires after the TTL; a reuse doesn't extend it", async () => {
    const w = world();
    const run = () => runFlow(options({ ttl: 30_000, read: true }), new ScriptedUi(), w.d);
    await run();
    w.tick(20_000);
    await run(); // cached
    w.tick(15_000);
    await run(); // 35 s after the real check: checks again
    expect(stsCalls(w.calls)).toBe(2);
  });

  test("read: false checks anyway but records the result", async () => {
    const w = world();
    await runFlow(options({ ttl: 30_000, read: false }), new ScriptedUi(), w.d);
    await runFlow(options({ ttl: 30_000, read: false }), new ScriptedUi(), w.d);
    expect(stsCalls(w.calls)).toBe(2);
    await runFlow(options({ ttl: 30_000, read: true }), new ScriptedUi(), w.d);
    expect(stsCalls(w.calls)).toBe(2);
  });

  test("failing targets aren't cached, and forget an earlier pass", async () => {
    const w = world(false);
    await runFlow(options({ ttl: 30_000, read: true }), new ScriptedUi(), w.d);
    await runFlow(options({ ttl: 30_000, read: true }), new ScriptedUi(), w.d);
    expect(stsCalls(w.calls)).toBe(2);
    expect(Object.values(w.files).every((f) => Object.keys(JSON.parse(f).entries).length === 0)).toBe(true);
  });

  test("no cache option: nothing is read or written", async () => {
    const w = world();
    await runFlow(options(undefined), new ScriptedUi(), w.d);
    await runFlow(options(undefined), new ScriptedUi(), w.d);
    expect(stsCalls(w.calls)).toBe(2);
    expect(w.files).toEqual({});
  });

  test("a corrupt cache file is ignored", async () => {
    const w = world();
    w.d.readFile = async () => "{not json";
    expect((await runFlow(options({ ttl: 30_000, read: true }), new ScriptedUi(), w.d)).code).toBe(0);
  });
});

describe("cacheKey", () => {
  test("differs by target and identity environment, not by unrelated env; never contains values", () => {
    const base = cacheKey(target, { HOME: "/a" });
    expect(cacheKey(target, { HOME: "/b" })).toBe(base);
    expect(cacheKey({ provider: "aws", target: { profile: "prod" } }, { HOME: "/a" })).not.toBe(base);
    expect(cacheKey(target, { AWS_PROFILE: "x" })).not.toBe(base);
    const cf: Target = { provider: "cloudflare", target: { tokenEnv: "MY_CF" } };
    expect(cacheKey(cf, { MY_CF: "secret" })).not.toBe(cacheKey(cf, { MY_CF: "other" }));
    expect(cacheKey(cf, { MY_CF: "secret" })).not.toContain("secret");
  });
});

describe("cache config", () => {
  test("ttl: off by default, true = 30 s, number = seconds", () => {
    expect(cacheTtl(undefined)).toBe(0);
    expect(cacheTtl(false)).toBe(0);
    expect(cacheTtl(true)).toBe(30_000);
    expect(cacheTtl(90)).toBe(90_000);
  });

  test("schema accepts booleans and positive whole seconds", () => {
    expect(configSchema.safeParse({ cache: true }).success).toBe(true);
    expect(configSchema.safeParse({ cache: 60 }).success).toBe(true);
    expect(configSchema.safeParse({ cache: 0 }).success).toBe(false);
    expect(configSchema.safeParse({ cache: 1.5 }).success).toBe(false);
    expect(configSchema.safeParse({ cache: "30s" }).success).toBe(false);
  });

  test("path: XDG cache, ~/.cache, LOCALAPPDATA on Windows", () => {
    // join: the separator is the host's, whichever platform is asked for.
    expect(cachePath({ XDG_CACHE_HOME: "/x" }, "linux", "/h")).toBe(join("/x", "cloudsesame", "checks.json"));
    expect(cachePath({}, "darwin", "/h")).toBe(join("/h", ".cache", "cloudsesame", "checks.json"));
    expect(cachePath({ LOCALAPPDATA: "L" }, "win32", "h")).toBe(join("L", "cloudsesame", "checks.json"));
    expect(cachePath({}, "win32", "h")).toBe(join("h", "AppData", "Local", "cloudsesame", "checks.json"));
  });
});
