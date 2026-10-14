import { describe, expect, test } from "bun:test";
import { check, exitCode, resolveTargets, UsageError } from "../src/core/check";
import { fakeExec } from "./helpers";

const installed = (...clis: string[]) => (cmd: string) => (clis.includes(cmd) ? `/bin/${cmd}` : undefined);

describe("resolveTargets", () => {
  test("configured providers, expanding arrays", () => {
    expect(resolveTargets({ aws: [{ profile: "a" }, { profile: "b" }], az: {} }, [])).toEqual([
      { provider: "aws", target: { profile: "a" } },
      { provider: "aws", target: { profile: "b" } },
      { provider: "az", target: {} },
    ]);
  });

  test("nothing configured: installed CLIs", () => {
    expect(resolveTargets({}, [], installed("aws"))).toEqual([{ provider: "aws", target: {} }]);
  });

  test("names and groups, deduplicated", () => {
    const config = { groups: { infra: ["gcloud" as const, "aws" as const] } };
    expect(resolveTargets(config, ["infra", "aws"]).map((t) => t.provider)).toEqual(["gcloud", "aws"]);
  });

  test("unknown name", () => {
    expect(() => resolveTargets({}, ["nope"])).toThrow(UsageError);
  });
});

describe("check", () => {
  test("offline short-circuits with exit 3", async () => {
    const { exec, calls } = fakeExec({});
    const report = await check({}, [{ provider: "aws", target: {} }], { exec, isOnline: async () => false });
    expect(report).toEqual({ online: false, results: [] });
    expect(calls).toEqual([]);
    expect(exitCode(report)).toBe(3);
  });

  test("missing CLI is reported, exit 4", async () => {
    const report = await check({ onlineCheck: false }, [{ provider: "az", target: {} }], { which: installed() });
    expect(report.online).toBeNull();
    expect(report.results[0]).toMatchObject({ provider: "az", state: "missing" });
    expect(exitCode(report)).toBe(4);
  });

  test("all ok, exit 0", async () => {
    const { exec } = fakeExec({ "aws sts get-caller-identity": { stdout: '{"Account":"1","Arn":"arn"}' } });
    const report = await check({}, [{ provider: "aws", target: {} }], { exec, which: installed("aws"), isOnline: async () => true });
    expect(exitCode(report)).toBe(0);
  });
});
