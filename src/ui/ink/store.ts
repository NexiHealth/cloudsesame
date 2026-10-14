import type { Choice, FlowEvent, FlowResult } from "../../core/flow/types";
import type { Status } from "../../core/providers/types";
import type { Target } from "../../core/targets";

export interface Row {
  target: Target;
  phase: "pending" | "checking" | "done" | "login";
  statuses: Status[];
  skipped: boolean;
  command?: string[];
}

export interface Prompt {
  message: string;
  choices: Choice<string>[];
  resolve: (value: string) => void;
}

export interface View {
  online?: boolean | null;
  rows: Row[];
  messages: Array<{ kind: "warning" | "error"; text: string; hint?: string }>;
  prompt?: Prompt;
  result?: FlowResult;
  animate: boolean;
}

export function reduce(view: View, event: FlowEvent): View {
  const row = (index: number, patch: Partial<Row>) => ({ ...view, rows: view.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  switch (event.type) {
    case "start":
      return { ...view, rows: event.targets.map((target) => ({ target, phase: "pending", statuses: [], skipped: false })) };
    case "online":
      return { ...view, online: event.online };
    case "checking":
      return row(event.index, { phase: "checking" });
    case "checked":
      return row(event.index, { phase: "done", statuses: event.statuses });
    case "login":
      return row(event.index, { phase: "login", command: event.command });
    case "login-failed":
      return view;
    case "skipped":
      return row(event.index, { skipped: true });
    case "warning":
    case "error":
      return { ...view, messages: [...view.messages, { kind: event.type, text: event.message, hint: "hint" in event ? event.hint : undefined }] };
  }
}

/** Minimal external store for useSyncExternalStore. */
export class Store {
  private view: View = { rows: [], messages: [], animate: false };
  private listeners = new Set<() => void>();

  get = () => this.view;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(fn: (view: View) => View) {
    this.view = fn(this.view);
    for (const l of this.listeners) l();
  }

  dispatch(event: FlowEvent) {
    this.update((v) => reduce(v, event));
  }
}
