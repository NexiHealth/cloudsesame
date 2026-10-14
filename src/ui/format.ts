import type { State, Status } from "../core/providers/types";

export { formatCommand } from "../core/exec";

export const symbols: Record<State, string> = { ok: "✔", unauthenticated: "✖", mismatch: "!", missing: "✖", error: "✖" };

export const statusTitle = (s: Status) => `${s.provider} ${s.label}`;
