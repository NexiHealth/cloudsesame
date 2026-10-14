import { expect, test } from "bun:test";
import { shouldAnimate } from "../src/core/flow/policy";

const base = { interactive: true, code: 0, loggedIn: true, env: {} };

test("animates after a login by default", () => {
  expect(shouldAnimate(base)).toBe(true);
  expect(shouldAnimate({ ...base, loggedIn: false })).toBe(false);
  expect(shouldAnimate({ ...base, loggedIn: false, policy: "always" })).toBe(true);
});

test("never animates when not appropriate", () => {
  expect(shouldAnimate({ ...base, policy: "never" })).toBe(false);
  expect(shouldAnimate({ ...base, interactive: false })).toBe(false);
  expect(shouldAnimate({ ...base, code: 4 })).toBe(false);
  expect(shouldAnimate({ ...base, env: { CI: "true" } })).toBe(false);
  expect(shouldAnimate({ ...base, env: { NO_COLOR: "1" } })).toBe(false);
});
