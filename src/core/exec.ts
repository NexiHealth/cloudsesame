import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Exec = (cmd: string, args: string[], opts?: { timeout?: number; env?: Record<string, string> }) => Promise<ExecResult>;

const isWindows = process.platform === "win32";

// gcloud/az are .cmd shims on Windows, which can only be spawned through a shell.
const quote = (arg: string) => (isWindows && /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg);

/** Run a command non-interactively and capture its output. Never rejects. */
export const exec: Exec = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args.map(quote), {
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWindows,
      timeout: opts.timeout,
      env: { ...process.env, ...opts.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => resolve({ code: 127, stdout, stderr: error.message }));
    child.on("close", (code, signal) =>
      resolve({ code: code ?? 1, stdout, stderr: signal === "SIGTERM" && !code ? `${stderr}\nTimed out` : stderr }),
    );
  });

/** Locate an executable on PATH (honours PATHEXT on Windows). */
export function which(cmd: string): string | undefined {
  const exts = isWindows ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    for (const ext of exts) {
      const file = join(dir, cmd + ext);
      if (dir && existsSync(file)) return file;
    }
  }
  return undefined;
}
