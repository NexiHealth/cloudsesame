import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { exec, type Exec, which } from "./exec";
import { type Http, http } from "./http";
import { isOnline } from "./online";

/** Side effects the core needs; injectable for tests. */
export interface Deps {
  exec: Exec;
  which: (cmd: string) => string | undefined;
  isOnline: (target: string, timeout?: number) => Promise<boolean>;
  http: Http;
  /** File contents, or undefined if it can't be read. */
  readFile: (path: string) => Promise<string | undefined>;
  /** Write a private file, creating its directory. Never rejects: a failed write is ignored. */
  writeFile: (path: string, content: string) => Promise<void>;
  /** Current time in ms (the check cache). */
  now: () => number;
  env: NodeJS.ProcessEnv;
}

export const defaultDeps: Deps = {
  exec,
  which,
  isOnline,
  http,
  readFile: (path) => readFile(path, "utf8").catch(() => undefined),
  writeFile: (path, content) =>
    mkdir(dirname(path), { recursive: true })
      .then(() => writeFile(path, content, { mode: 0o600 }))
      .catch(() => {}),
  now: Date.now,
  // A getter: `process.env` can be replaced (bun test does, per file), and the cache path must follow it.
  get env() {
    return process.env;
  },
};
