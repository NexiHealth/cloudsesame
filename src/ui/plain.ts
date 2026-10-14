import { createInterface } from "node:readline/promises";
import { execInteractive } from "../core/exec";
import { type Choice, type FlowEvent, InterruptError, type Ui } from "../core/flow/types";
import type { Status } from "../core/providers/types";
import { type Target, targetLabel } from "../core/targets";
import { formatCommand, statusTitle, symbols } from "./format";

export function formatStatus(s: Status & { skipped?: true }): string[] {
  const detail = [s.identity, s.message].filter(Boolean).join(": ");
  const lines = [`${symbols[s.state]} ${statusTitle(s)}${detail ? `  ${detail}` : ""}${s.skipped ? "  (skipped)" : ""}`];
  if (s.fix && s.state !== "ok") lines.push(`  → ${formatCommand(s.fix)}`);
  return lines;
}

/** Line-based UI: no colors, no cursor movement; prompts via readline. `silent` prints nothing (--json). */
export class PlainUi implements Ui {
  private targets: Target[] = [];
  // Initial checks run in parallel; print them in target order.
  private pending = new Map<number, Status[]>();
  private nextToPrint = 0;

  constructor(private readonly opts: { silent?: boolean } = {}) {}

  private log(line: string) {
    if (!this.opts.silent) console.log(line);
  }

  emit(event: FlowEvent): void {
    switch (event.type) {
      case "start":
        this.targets = event.targets;
        break;
      case "online":
        if (event.online !== null) this.log(event.online ? "✔ online" : "✖ offline");
        break;
      case "checked":
        if (this.nextToPrint < this.targets.length) {
          this.pending.set(event.index, event.statuses);
          while (this.pending.has(this.nextToPrint)) {
            for (const s of this.pending.get(this.nextToPrint)!) formatStatus(s).forEach((l) => this.log(l));
            this.pending.delete(this.nextToPrint++);
          }
        } else {
          for (const s of event.statuses) formatStatus(s).forEach((l) => this.log(l));
        }
        break;
      case "login":
        this.log(`↪ ${formatCommand(event.command)}`);
        break;
      case "login-failed":
        this.log(`✖ ${targetLabel(this.targets[event.index]!)}: command exited with ${event.code}`);
        break;
      case "skipped":
        this.log(`- skipped ${targetLabel(this.targets[event.index]!)}`);
        break;
      case "warning":
        this.log(`! ${event.message}`);
        break;
      case "error":
        if (!this.opts.silent) console.error(`✖ ${event.message}${event.hint ? `\n  ${event.hint}` : ""}`);
        break;
    }
  }

  async choose<T extends string>(message: string, choices: Choice<T>[]): Promise<T> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const interrupted = new Promise<never>((_, reject) => rl.once("SIGINT", () => reject(new InterruptError())));
    const options = choices.map((c) => `[${c.key}] ${c.label}${c.hint ? ` (${c.hint})` : ""}`).join("  ");
    try {
      while (true) {
        const answer = (await Promise.race([rl.question(`? ${message} ${options}: `), interrupted])).trim().toLowerCase();
        const choice = answer === "" ? choices[0] : choices.find((c) => c.key === answer || c.label.toLowerCase() === answer);
        if (choice) return choice.value;
      }
    } finally {
      rl.close();
    }
  }

  handOff(command: string[]): Promise<number> {
    return execInteractive(command);
  }
}
