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

export const ctx = (exec: Exec) => ({ exec, timeout: 1000 });
