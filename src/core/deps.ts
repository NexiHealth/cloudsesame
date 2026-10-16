import { readFile } from "node:fs/promises";
import { exec, type Exec, which } from "./exec";
import { isOnline } from "./online";

/** Side effects the core needs; injectable for tests. */
export interface Deps {
  exec: Exec;
  which: (cmd: string) => string | undefined;
  isOnline: (target: string, timeout?: number) => Promise<boolean>;
  /** File contents, or undefined if it can't be read. */
  readFile: (path: string) => Promise<string | undefined>;
  env: NodeJS.ProcessEnv;
}

export const defaultDeps: Deps = {
  exec,
  which,
  isOnline,
  readFile: (path) => readFile(path, "utf8").catch(() => undefined),
  env: process.env,
};
