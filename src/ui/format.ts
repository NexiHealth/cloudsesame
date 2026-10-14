import type { State, Status } from "../core/providers/types";

export const symbols: Record<State, string> = { ok: "✔", unauthenticated: "✖", mismatch: "!", missing: "✖", error: "✖" };

export const formatCommand = (cmd: string[]) => cmd.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(" ");

export const statusTitle = (s: Status) => `${s.provider} ${s.label}`;
