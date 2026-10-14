import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema } from "../src/core/config/schema";
import { detectConfig, renderConfig, SCHEMA_URL } from "../src/core/init";
import { fakeExec, installed } from "./helpers";

const dir = mkdtempSync(join(tmpdir(), "sesame-init-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const { exec } = fakeExec({
  "gcloud config get-value project": { stdout: "my-proj\n" },
  "aws configure list-profiles": { stdout: "default\ndev\nprod\n" },
  "az account show": { stdout: "Prod Sub\n" },
});

test("detects providers from installed CLIs", async () => {
  expect(await detectConfig({ exec, which: installed("gcloud", "aws", "az") })).toEqual({
    config: { gcloud: { credentials: "both", project: "my-proj" }, aws: { profile: "default" }, az: { subscription: "Prod Sub" } },
    otherAwsProfiles: ["dev", "prod"],
  });
  expect(await detectConfig({ exec, which: installed() })).toEqual({ config: {}, otherAwsProfiles: [] });
});

test("rendered TS config is valid and loads", async () => {
  const detected = await detectConfig({ exec, which: installed("gcloud", "aws") });
  const source = renderConfig(detected, "ts");
  expect(source).toContain("// Other AWS profiles: dev, prod");
  expect(source).toContain('project: "my-proj"');
  const file = join(dir, "sesame.config.ts");
  writeFileSync(file, source);
  const mod = await import(file);
  expect(configSchema.safeParse(mod.default).success).toBe(true);
});

test("rendered JSON config has the schema", async () => {
  const json = JSON.parse(renderConfig({ config: { aws: {} }, otherAwsProfiles: [] }, "json"));
  expect(json).toEqual({ $schema: SCHEMA_URL, aws: {} });
});

test("skill install command prefers bunx, falls back to npx", async () => {
  const { skillInstallCommand } = await import("../src/core/init");
  expect(skillInstallCommand(installed("bunx", "npx"))).toEqual(["bunx", "skills", "add", "NexiHealth/cloudsesame"]);
  expect(skillInstallCommand(installed("npx"))).toEqual(["npx", "-y", "skills", "add", "NexiHealth/cloudsesame"]);
  expect(skillInstallCommand(installed())).toBeUndefined();
});
