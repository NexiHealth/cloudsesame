import { exec, type Exec, which } from "./exec";
import { isOnline } from "./online";

/** Side effects the core needs; injectable for tests. */
export interface Deps {
  exec: Exec;
  which: (cmd: string) => string | undefined;
  isOnline: (target: string, timeout?: number) => Promise<boolean>;
}

export const defaultDeps: Deps = { exec, which, isOnline };
