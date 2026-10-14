import { describe, expect, spyOn, test } from "bun:test";
import pkg from "../package.json" with { type: "json" };
import { run } from "../src/run";

function capture(argv: string[]) {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    const code = run(argv);
    return { code, out: log.mock.calls.join("\n"), err: error.mock.calls.join("\n") };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

describe("cli", () => {
  test("--version prints the package version", () => {
    expect(capture(["--version"])).toMatchObject({ code: 0, out: pkg.version });
  });

  test("no args prints help", () => {
    expect(capture([]).out).toContain("Usage:");
  });

  test("hello greets", () => {
    expect(capture(["hello", "sesame"]).out).toBe("Hello, sesame!");
  });

  test("unknown command fails", () => {
    const { code, err } = capture(["nope"]);
    expect(code).toBe(1);
    expect(err).toContain("Unknown command: nope");
  });
});
