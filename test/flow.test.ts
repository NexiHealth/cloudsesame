import { describe, expect, test } from "bun:test";
import { resolvePolicies } from "../src/core/flow/policy";
import { runFlow } from "../src/core/flow/run";
import type { FlowOptions, Policies } from "../src/core/flow/types";
import { deps, fakeExec, ScriptedUi } from "./helpers";

const ok = { stdout: JSON.stringify({ Account: "123456789012", Arn: "arn:me" }) };
const expired = { code: 255, stderr: "aws: [ERROR]: Token has expired" };

/** aws that is logged out until `aws sso login` runs (successfully, if loginWorks). */
function awsWorld(loginWorks = true) {
  let loggedIn = false;
  const { exec } = fakeExec({});
  const world = {
    exec: async (cmd: string, args: string[]) => {
      if (args[0] === "sts") return { code: 0, stdout: "", stderr: "", ...(loggedIn ? ok : expired) };
      if (args.join(" ").startsWith("configure get sso_session")) return { code: 0, stdout: "corp", stderr: "" };
      return exec(cmd, args);
    },
    handOff: () => {
      loggedIn = loginWorks;
      return loginWorks ? 0 : 1;
    },
  };
  return world;
}

const policies = (p: Partial<Policies> = {}): Policies => ({ offline: "prompt", unauthenticated: "prompt", noTerminal: "fail", strict: false, ...p });

const options = (p: Partial<Policies> = {}, interactive = true): FlowOptions => ({
  config: {},
  targets: [{ provider: "aws", target: { profile: "dev" } }],
  policies: policies(p),
  interactive,
});

describe("offline", () => {
  test("prompt: continue", async () => {
    const ui = new ScriptedUi(["continue"]);
    const r = await runFlow(options(), ui, deps({ online: false }));
    expect(r.code).toBe(0);
    expect(ui.of("warning")[0]?.message).toContain("Offline");
  });

  test("prompt: stop -> 5", async () => {
    expect((await runFlow(options(), new ScriptedUi(["stop"]), deps({ online: false }))).code).toBe(5);
  });

  test("no terminal: fail with a --skip hint -> 3", async () => {
    const ui = new ScriptedUi();
    expect((await runFlow(options({}, false), ui, deps({ online: false }))).code).toBe(3);
    expect(ui.of("error")[0]?.hint).toContain("--skip");
  });

  test("no terminal + noTerminal: skip -> continue", async () => {
    expect((await runFlow(options({ noTerminal: "skip" }, false), new ScriptedUi(), deps({ online: false }))).code).toBe(0);
  });

  test("continue + strict -> 3", async () => {
    expect((await runFlow(options({ offline: "continue", strict: true }), new ScriptedUi(), deps({ online: false }))).code).toBe(3);
  });
});

describe("unauthenticated", () => {
  test("all ok: no prompts, exit 0", async () => {
    const { exec } = fakeExec({ "aws sts": ok });
    const ui = new ScriptedUi();
    expect((await runFlow(options(), ui, deps({ exec }))).code).toBe(0);
    expect(ui.prompts).toEqual([]);
  });

  test("prompt: log in, re-check, exit 0", async () => {
    const world = awsWorld();
    const ui = new ScriptedUi(["login"], world.handOff);
    const r = await runFlow(options(), ui, deps({ exec: world.exec }));
    expect(ui.prompts).toEqual([{ message: "aws dev isn't ready.", choices: ["login", "skip", "stop"] }]);
    expect(ui.handOffs).toEqual([["aws", "sso", "login", "--profile", "dev"]]);
    expect(r).toMatchObject({ code: 0, loggedIn: true, results: [{ state: "ok" }] });
  });

  test("prompt: failed login re-prompts; then skip -> 0, marked skipped", async () => {
    const world = awsWorld(false);
    const ui = new ScriptedUi(["login", "skip"], world.handOff);
    const r = await runFlow(options(), ui, deps({ exec: world.exec }));
    expect(ui.prompts).toHaveLength(2);
    expect(ui.of("login-failed")).toHaveLength(1);
    expect(r).toMatchObject({ code: 0, loggedIn: false, results: [{ state: "unauthenticated", skipped: true }] });
  });

  test("skip + strict -> 4", async () => {
    const world = awsWorld();
    expect((await runFlow(options({ unauthenticated: "skip", strict: true }), new ScriptedUi(), deps({ exec: world.exec }))).code).toBe(4);
  });

  test("prompt: stop -> 5", async () => {
    const world = awsWorld();
    expect((await runFlow(options(), new ScriptedUi(["stop"]), deps({ exec: world.exec }))).code).toBe(5);
  });

  test("no terminal: fail with the fix and a --skip hint -> 4", async () => {
    const world = awsWorld();
    const ui = new ScriptedUi();
    const r = await runFlow(options({}, false), ui, deps({ exec: world.exec }));
    expect(r.code).toBe(4);
    expect(ui.of("error")).toEqual([
      {
        type: "error",
        message: "Not ready: aws dev",
        hint: "No terminal to prompt in. Run `aws sso login --profile dev`, or rerun with --skip to continue without it.",
      },
    ]);
  });

  test("login policy: one attempt, then fail", async () => {
    const world = awsWorld(false);
    const ui = new ScriptedUi([], world.handOff);
    expect((await runFlow(options({ unauthenticated: "login" }), ui, deps({ exec: world.exec }))).code).toBe(4);
    expect(ui.handOffs).toHaveLength(1);
  });

  test("report (check): no prompts, no logins, exit 4", async () => {
    const world = awsWorld();
    const ui = new ScriptedUi();
    expect((await runFlow(options({ unauthenticated: "report" }), ui, deps({ exec: world.exec }))).code).toBe(4);
    expect([ui.prompts, ui.handOffs, ui.of("error")]).toEqual([[], [], []]);
  });

  test("missing CLI without a fix: prompt offers only skip/stop", async () => {
    const ui = new ScriptedUi(["skip"]);
    await runFlow(options(), ui, deps({ which: () => undefined }));
    expect(ui.prompts[0]?.choices).toEqual(["skip", "stop"]);
  });
});

describe("resolvePolicies", () => {
  const none = { skip: false, yes: false, strict: false };

  test("defaults", () => {
    expect(resolvePolicies("predev", {}, none)).toEqual(policies());
    expect(resolvePolicies("auth", {}, none).offline).toBe("fail");
    expect(resolvePolicies("check", {}, none)).toMatchObject({ offline: "fail", unauthenticated: "report" });
  });

  test("flags > config > defaults", () => {
    expect(resolvePolicies("predev", { unauthenticated: "fail", offline: "fail" }, none)).toMatchObject({ unauthenticated: "fail", offline: "fail" });
    expect(resolvePolicies("predev", { unauthenticated: "fail" }, { ...none, skip: true })).toMatchObject({ unauthenticated: "skip", offline: "continue" });
    expect(resolvePolicies("predev", {}, { ...none, yes: true })).toMatchObject({ unauthenticated: "login", offline: "continue" });
    expect(resolvePolicies("predev", {}, { ...none, skip: true, unauthenticated: "fail" }).unauthenticated).toBe("fail");
    expect(resolvePolicies("predev", { noTerminal: "skip" }, none).noTerminal).toBe("skip");
  });
});

