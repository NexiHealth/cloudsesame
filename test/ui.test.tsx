import { expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { StatusLine } from "../src/ui/status-line";

test("StatusLine shows state, identity, message and fix", () => {
  const { lastFrame } = render(
    <StatusLine status={{ provider: "aws", label: "dev", state: "unauthenticated", message: "expired", fix: ["aws", "sso", "login", "--profile", "dev"] }} />,
  );
  expect(lastFrame()).toBe("✖ aws dev  expired\n  → aws sso login --profile dev");
});
