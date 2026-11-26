import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { run } from "../src/run";

async function capture(argv: string[], cwd?: string) {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    const code = await run(argv, cwd);
    return { code, out: log.mock.calls.join("\n"), err: error.mock.calls.join("\n") };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

describe("cli", () => {
  test("--version", async () => {
    expect(await capture(["--version"])).toMatchObject({ code: 0, out: pkg.version });
  });

  test("--help", async () => {
    expect((await capture(["--help"])).out).toContain("Usage:");
  });

  test("bad flags and unknown names exit 2", async () => {
    expect((await capture(["check", "--nope"])).code).toBe(2);
    expect((await capture(["--offline", "maybe"])).err).toContain("--offline must be one of");
    const unknown = await capture(["nope", "--plain"]);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("Commands: auth, predev, check, init");
  });
});

// End-to-end against a fake gcloud on PATH.
describe.skipIf(process.platform === "win32")("check e2e", () => {
  const dir = mkdtempSync(join(tmpdir(), "sesame-e2e-"));
  const path = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${path}`;
  afterAll(() => {
    process.env.PATH = path;
    rmSync(dir, { recursive: true, force: true });
  });

  writeFileSync(join(dir, ".git"), "");
  writeFileSync(join(dir, "sesame.config.json"), JSON.stringify({ onlineCheck: false, gcloud: { credentials: "adc" } }));
  const gcloud = (exitCode: number) => {
    writeFileSync(join(dir, "gcloud"), `#!/bin/sh\necho "ERROR: (gcloud) adc expired" >&2\nexit ${exitCode}\n`);
    chmodSync(join(dir, "gcloud"), 0o755);
  };

  test("plain: ok", async () => {
    gcloud(0);
    expect(await capture(["check", "--plain"], dir)).toMatchObject({ code: 0, out: "✔ gcloud adc" });
  });

  test("plain: unauthenticated shows the fix, exit 4", async () => {
    gcloud(1);
    const { code, out } = await capture(["check", "--plain"], dir);
    expect(code).toBe(4);
    expect(out).toBe("✖ gcloud adc  adc expired\n  → gcloud auth application-default login");
  });

  test("auth without a terminal fails with the fix and a --skip hint", async () => {
    gcloud(1);
    const { code, err } = await capture(["auth", "--plain"], dir);
    expect(code).toBe(4);
    expect(err).toBe(
      "✖ Not ready: gcloud\n  No terminal to prompt in. Run `gcloud auth application-default login`, or rerun with --skip to continue without it.",
    );
  });

  test("default command is auth; --skip continues", async () => {
    gcloud(1);
    const { code, out } = await capture(["gcloud", "--skip", "--plain"], dir);
    expect(code).toBe(0);
    expect(out).toContain("- skipped gcloud");
  });

  test("predev --strict --skip fails", async () => {
    gcloud(1);
    expect((await capture(["predev", "--skip", "--strict", "--plain"], dir)).code).toBe(4);
  });

  test("-- runs the command once ready and exits with its code; not ready, it doesn't run", async () => {
    const marker = join(dir, "ran");
    gcloud(0);
    expect((await capture(["check", "--plain", "--", "sh", "-c", `touch ${marker}; exit 3`], dir)).code).toBe(3);
    expect(existsSync(marker)).toBe(true);
    rmSync(marker);
    gcloud(1);
    expect((await capture(["check", "--plain", "--", "sh", "-c", `touch ${marker}`], dir)).code).toBe(4);
    expect(existsSync(marker)).toBe(false);
  });

  test("-- passes the cf login's token as CLOUDFLARE_API_TOKEN", async () => {
    const creds = join(dir, "cf-default.json");
    writeFileSync(creds, JSON.stringify({ oauth_token: "oauth-from-cf", refresh_token: "r", expiration_time: "2099-01-01T00:00:00Z" }));
    const whoami = { authenticated: true, authSource: `OAuth token from ${creds}`, tokenValid: true, email: "me@acme.dev", accounts: [] };
    writeFileSync(join(dir, "cf"), `#!/bin/sh\necho '${JSON.stringify(whoami)}'\n`);
    chmodSync(join(dir, "cf"), 0o755);
    writeFileSync(join(dir, "cf.config.json"), JSON.stringify({ onlineCheck: false, cloudflare: {} }));
    const out = join(dir, "token");
    const env = { ...process.env };
    delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      const result = await capture(["-c", "cf.config.json", "--plain", "--", "sh", "-c", `printf %s "$CLOUDFLARE_API_TOKEN" > ${out}`], dir);
      // With a command after --, our output goes to stderr: stdout is the command's.
      expect(result).toMatchObject({ code: 0, out: "", err: "✔ cloudflare login  me@acme.dev" });
      expect(readFileSync(out, "utf8")).toBe("oauth-from-cf");
    } finally {
      process.env = env;
    }
  });

  test("env prints exports on stdout, status on stderr; nothing when not ready", async () => {
    const env = { ...process.env };
    delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      const ok = await capture(["env", "-c", "cf.config.json", "--plain", "--shell", "sh"], dir);
      expect(ok).toMatchObject({ code: 0, out: "export CLOUDFLARE_API_TOKEN='oauth-from-cf'", err: "✔ cloudflare login  me@acme.dev" });
      const fish = await capture(["env", "-c", "cf.config.json", "--plain", "--shell", "fish"], dir);
      expect(fish.out).toBe("set -gx CLOUDFLARE_API_TOKEN 'oauth-from-cf'");
      writeFileSync(join(dir, "cf"), `#!/bin/sh\necho '{"authenticated":false}'\n`);
      const notReady = await capture(["env", "-c", "cf.config.json", "--plain"], dir);
      expect(notReady.code).toBe(4);
      expect(notReady.out).toBe("");
    } finally {
      process.env = env;
    }
  });


  test("-- usage errors", async () => {
    expect((await capture(["check", "--"], dir)).err).toContain("Missing command after --");
    expect((await capture(["check", "--json", "--", "true"], dir)).code).toBe(2);
    expect((await capture(["init", "--", "true"], dir)).err).toContain("init doesn't run a command");
    expect((await capture(["env", "--json"], dir)).err).toContain("no --json");
  });

  test("json", async () => {
    gcloud(1);
    const { code, out } = await capture(["check", "--json"], dir);
    expect(code).toBe(4);
    expect(JSON.parse(out)).toMatchObject({ ok: false, online: null, results: [{ provider: "gcloud", state: "unauthenticated" }] });
  });
});

// The `cache` config, end to end: a fake gcloud that counts its calls, and a private cache dir.
describe.skipIf(process.platform === "win32")("cache e2e", () => {
  const dir = mkdtempSync(join(tmpdir(), "sesame-cache-"));
  const saved = { PATH: process.env.PATH, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME };
  // In beforeAll, not at collection time: the suite above puts its own gcloud on PATH.
  beforeAll(() => {
    process.env.PATH = `${dir}${delimiter}${saved.PATH}`;
    process.env.XDG_CACHE_HOME = join(dir, "cache");
  });
  afterAll(() => {
    process.env.PATH = saved.PATH;
    if (saved.XDG_CACHE_HOME === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = saved.XDG_CACHE_HOME;
    rmSync(dir, { recursive: true, force: true });
  });

  const counter = join(dir, "calls");
  writeFileSync(join(dir, ".git"), "");
  writeFileSync(join(dir, "sesame.config.json"), JSON.stringify({ onlineCheck: false, cache: true, gcloud: { credentials: "adc" } }));
  writeFileSync(join(dir, "gcloud"), `#!/bin/sh\necho x >> ${counter}\necho token\n`);
  chmodSync(join(dir, "gcloud"), 0o755);
  const calls = () => (existsSync(counter) ? readFileSync(counter, "utf8").trim().split("\n").length : 0);

  test("auth reuses a recent pass; check and --fresh always check", async () => {
    // gcloud runs twice per check (adc token + account).
    expect(await capture(["auth", "--plain"], dir)).toMatchObject({ code: 0, out: "✔ gcloud adc" });
    const first = calls();
    expect(await capture(["auth", "--plain"], dir)).toMatchObject({ code: 0, out: "✔ gcloud adc  (cached)" });
    expect(calls()).toBe(first);
    expect((await capture(["check", "--plain"], dir)).out).toBe("✔ gcloud adc");
    expect(calls()).toBe(first * 2);
    expect((await capture(["auth", "--fresh", "--plain"], dir)).out).toBe("✔ gcloud adc");
    expect(calls()).toBe(first * 3);
  });

  test("a cached cloudflare login still hands the token to the command, without running cf", async () => {
    const cfCalls = join(dir, "cf-calls");
    const creds = join(dir, "cf-creds.json");
    writeFileSync(creds, JSON.stringify({ oauth_token: "oauth-from-cf", expiration_time: "2099-01-01T00:00:00Z" }));
    const whoami = { authenticated: true, authSource: `OAuth token from ${creds}`, tokenValid: true, email: "me@acme.dev", accounts: [] };
    writeFileSync(join(dir, "cf"), `#!/bin/sh\necho x >> ${cfCalls}\necho '${JSON.stringify(whoami)}'\n`);
    chmodSync(join(dir, "cf"), 0o755);
    writeFileSync(join(dir, "cf.config.json"), JSON.stringify({ onlineCheck: false, cache: true, cloudflare: {} }));
    const out = join(dir, "token");
    const env = { ...process.env };
    delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      const cmd = ["-c", "cf.config.json", "--plain", "--", "sh", "-c", `printf %s "$CLOUDFLARE_API_TOKEN" > ${out}`];
      expect((await capture(cmd, dir)).code).toBe(0);
      const ran = readFileSync(cfCalls, "utf8");
      const second = await capture(cmd, dir);
      expect(second).toMatchObject({ code: 0, err: "✔ cloudflare login  me@acme.dev  (cached)" });
      expect(readFileSync(out, "utf8")).toBe("oauth-from-cf");
      expect(readFileSync(cfCalls, "utf8")).toBe(ran);
    } finally {
      process.env = env;
    }
  });
});
