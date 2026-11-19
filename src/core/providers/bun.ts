import { homedir } from "node:os";
import { join } from "node:path";
import { selfBun } from "../exec";
import type { CheckContext } from "./types";

/**
 * A Bun to run npm CLIs with (`<bun> x <package>`): on PATH, this binary acting as Bun, or Bun's installer's
 * `$BUN_INSTALL/bin` (default `~/.bun/bin`), which may not be on PATH yet.
 */
export function bunPath(which: CheckContext["which"], env: NodeJS.ProcessEnv, home = homedir()): string | undefined {
  return which("bun") ? "bun" : (selfBun() ?? which(join(env.BUN_INSTALL ?? join(home, ".bun"), "bin", "bun")));
}

/** Bun's official installer (https://bun.sh). */
export const installBun = (platform = process.platform) =>
  platform === "win32" ? ["powershell", "-c", "irm bun.sh/install.ps1 | iex"] : ["bash", "-c", "curl -fsSL https://bun.sh/install | bash"];
