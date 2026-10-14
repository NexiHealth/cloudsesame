import { describe, expect, test } from "bun:test";
import { checkTarget } from "../src/core/check";
import { resolveTargets, targetLabel, UsageError } from "../src/core/targets";
import { deps, installed } from "./helpers";

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

test("targetLabel", () => {
  expect(targetLabel({ provider: "aws", target: { profile: "dev" } })).toBe("aws dev");
  expect(targetLabel({ provider: "gcloud", target: { project: "p" } })).toBe("gcloud p");
  expect(targetLabel({ provider: "az", target: {} })).toBe("az");
});

test("checkTarget reports a missing CLI", async () => {
  const statuses = await checkTarget({ provider: "az", target: {} }, deps({ which: installed() }), 1000);
  expect(statuses).toMatchObject([{ provider: "az", state: "missing" }]);
});
