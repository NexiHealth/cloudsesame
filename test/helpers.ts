import type { Exec, ExecResult } from "../src/core/exec";

/** Fake exec keyed by "cmd arg1 arg2..." prefix; unmatched commands fail. Records calls. */
export function fakeExec(responses: Record<string, Partial<ExecResult>>) {
  const calls: string[] = [];
  const exec: Exec = async (cmd, args) => {
    const line = [cmd, ...args].join(" ");
    calls.push(line);
    const key = Object.keys(responses)
      .filter((k) => line.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    return { code: 1, stdout: "", stderr: `unexpected: ${line}`, ...(key ? { code: 0, ...responses[key] } : {}) };
  };
  return { exec, calls };
}

export const ctx = (exec: Exec, files: Record<string, string> = {}) => ({
  exec,
  readFile: async (path: string) => files[path],
  env: { CLOUDSDK_CONFIG: "/gc" },
  timeout: 1000,
});

import type { Deps } from "../src/core/deps";
import type { Choice, FlowEvent, Ui } from "../src/core/flow/types";

export const installed =
  (...clis: string[]) =>
  (cmd: string) =>
    clis.includes(cmd) ? `/bin/${cmd}` : undefined;

export function deps(overrides: Partial<Deps> & { online?: boolean } = {}): Deps {
  return {
    exec: fakeExec({}).exec,
    which: installed("gcloud", "aws", "az"),
    isOnline: async () => overrides.online ?? true,
    readFile: async () => undefined,
    env: {},
    ...overrides,
  };
}

/** Ui that answers prompts from a script and records everything. */
export class ScriptedUi implements Ui {
  events: FlowEvent[] = [];
  prompts: Array<{ message: string; choices: string[] }> = [];
  handOffs: string[][] = [];

  constructor(
    private answers: string[] = [],
    private onHandOff: (command: string[]) => number | Promise<number> = () => 0,
  ) {}

  emit(event: FlowEvent) {
    this.events.push(event);
  }

  async choose<T extends string>(message: string, choices: Choice<T>[]): Promise<T> {
    this.prompts.push({ message, choices: choices.map((c) => c.value) });
    const answer = this.answers.shift();
    if (!answer) throw new Error(`unexpected prompt: ${message}`);
    return answer as T;
  }

  async handOff(command: string[]) {
    this.handOffs.push(command);
    return this.onHandOff(command);
  }

  of<T extends FlowEvent["type"]>(type: T) {
    return this.events.filter((e): e is Extract<FlowEvent, { type: T }> => e.type === type);
  }
}
