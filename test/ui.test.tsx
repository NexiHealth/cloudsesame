import { expect, test } from "bun:test";
import { render } from "ink-testing-library";
import type { FlowEvent } from "../src/core/flow/types";
import { reduce, type View } from "../src/ui/ink/store";
import { StatusLine } from "../src/ui/ink/status-line";
import { formatStatus } from "../src/ui/plain";

test("StatusLine shows state, message and fix", () => {
  const { lastFrame } = render(
    <StatusLine status={{ provider: "aws", label: "dev", state: "unauthenticated", message: "expired", fix: ["aws", "sso", "login", "--profile", "dev"] }} />,
  );
  expect(lastFrame()).toBe("✖ aws dev  expired\n  → aws sso login --profile dev");
});

test("plain formatStatus matches", () => {
  expect(formatStatus({ provider: "gcloud", label: "adc", state: "ok" })).toEqual(["✔ gcloud adc"]);
  expect(formatStatus({ provider: "aws", label: "dev", state: "unauthenticated", message: "expired", skipped: true })).toEqual(["✖ aws dev  expired  (skipped)"]);
});

test("reducer tracks rows through a login", () => {
  const target = { provider: "aws" as const, target: {} };
  let view: View = { rows: [], messages: [], animate: false };
  const events: FlowEvent[] = [
    { type: "start", targets: [target] },
    { type: "online", online: true },
    { type: "checking", index: 0 },
    { type: "login", index: 0, command: ["aws", "login"] },
  ];
  for (const event of events) {
    view = reduce(view, event);
  }
  expect(view.online).toBe(true);
  expect(view.rows[0]).toMatchObject({ phase: "login", command: ["aws", "login"] });
  view = reduce(view, { type: "checked", index: 0, statuses: [{ provider: "aws", label: "default", state: "ok" }] });
  expect(view.rows[0]).toMatchObject({ phase: "done", statuses: [{ state: "ok" }] });
});
