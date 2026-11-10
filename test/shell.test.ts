import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectShell, formatExports, shellInit } from "../src/commands/shell";

describe("formatExports", () => {
  const value = { T: `a'b\\c$d` };
  test("quotes so nothing expands", () => {
    expect(formatExports(value, "sh")).toBe(`export T='a'\\''b\\c$d'`);
    expect(formatExports(value, "fish")).toBe(`set -gx T 'a\\'b\\\\c$d'`);
    expect(formatExports(value, "pwsh")).toBe(`$env:T = 'a''b\\c$d'`);
  });

  test("round-trips through a real sh", () => {
    const out = spawnSync("sh", ["-c", `${formatExports(value, "sh")}; printf %s "$T"`], { encoding: "utf8" });
    expect(out.stdout).toBe(value.T);
  });
});

test("detectShell", () => {
  expect(detectShell({ SHELL: "/opt/homebrew/bin/fish" }, "darwin")).toBe("fish");
  expect(detectShell({ SHELL: "/bin/zsh" }, "linux")).toBe("sh");
  expect(detectShell({}, "win32")).toBe("pwsh");
});

// Source the generated functions in real shells, with fake cloudsesame and tofu on PATH that log their arguments.
describe.skipIf(process.platform === "win32")("shell-init functions", () => {
  const dir = mkdtempSync(join(tmpdir(), "sesame-shell-"));
  const log = join(dir, "log");
  for (const bin of ["cloudsesame", "tofu"]) {
    writeFileSync(join(dir, bin), `#!/bin/sh\necho "${bin} $*" >> ${log}\n`);
    chmodSync(join(dir, bin), 0o755);
  }
  const run = (shell: "bash" | "zsh" | "fish" | "pwsh", calls: string[]) => {
    writeFileSync(log, "");
    const script = `${shellInit(shell, ["tofu"])}\n${calls.join("\n")}`;
    const args = shell === "pwsh" ? ["-NoProfile", "-Command", script] : ["-c", script];
    const res = spawnSync(shell, args, { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    if (res.status !== 0) throw new Error(res.stderr);
    return readFileSync(log, "utf8").trim().split("\n");
  };
  const calls = ["tofu plan -out x", "tofu -chdir=infra apply", "tofu fmt", "tofu version", "tofu"];
  const expected = ["cloudsesame auth -- tofu plan -out x", "cloudsesame auth -- tofu -chdir=infra apply", "tofu fmt", "tofu version", "tofu"];

  for (const shell of ["bash", "zsh", "fish", "pwsh"] as const) {
    test.skipIf(!Bun.which(shell))(shell, () => {
      expect(run(shell, calls)).toEqual(expected);
    });
  }

  test("cleanup", () => rmSync(dir, { recursive: true, force: true }));
});
