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

  test("nothing configured: CLI-less providers aren't auto-detected", () => {
    expect(resolveTargets({}, [], installed("aws", "cloudflare"))).toEqual([{ provider: "aws", target: {} }]);
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
  expect(targetLabel({ provider: "wrangler", target: { account: "Acme" } })).toBe("wrangler Acme");
  expect(targetLabel({ provider: "cloudflare", target: { zones: ["a.dev", "b.dev"] } })).toBe("cloudflare a.dev, b.dev");
});

test("checkTarget reports a missing CLI", async () => {
  const statuses = await checkTarget({ provider: "az", target: {} }, deps({ which: installed() }), 1000);
  expect(statuses).toMatchObject([{ provider: "az", state: "missing" }]);
});

test("checkTarget: cloudflare has no CLI of its own; without cf or Bun it offers to install Bun", async () => {
  const statuses = await checkTarget({ provider: "cloudflare", target: {} }, deps({ which: installed(), env: {} }), 1000);
  expect(statuses).toMatchObject([{ provider: "cloudflare", label: "login", state: "missing" }]);
});
