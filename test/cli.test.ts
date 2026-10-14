import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  test("no args prints help", async () => {
    expect((await capture([])).out).toContain("Usage:");
  });

  test("unknown command and flag exit 2", async () => {
    expect((await capture(["nope"])).code).toBe(2);
    expect((await capture(["check", "--nope"])).code).toBe(2);
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

  test("json", async () => {
    gcloud(1);
    const { code, out } = await capture(["check", "--json"], dir);
    expect(code).toBe(4);
    expect(JSON.parse(out)).toMatchObject({ ok: false, online: null, results: [{ provider: "gcloud", state: "unauthenticated" }] });
  });
});
