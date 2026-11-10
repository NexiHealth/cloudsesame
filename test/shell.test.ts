import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { detectShell, formatExports } from "../src/commands/shell";

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
