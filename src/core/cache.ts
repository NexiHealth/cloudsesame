import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "./config/types";
import type { Deps } from "./deps";
import type { Status } from "./providers/types";
import type { Target } from "./targets";

export const DEFAULT_CACHE_SECONDS = 30;

/** Entries older than this are dropped on write, whatever the TTL of the repo that wrote them. */
const MAX_AGE = 24 * 60 * 60 * 1000;

/** `cache` config -> TTL in ms; 0 when off. */
export const cacheTtl = (cache: Config["cache"]): number =>
  cache === true ? DEFAULT_CACHE_SECONDS * 1000 : typeof cache === "number" ? cache * 1000 : 0;

/** Where passing checks are remembered: `$XDG_CACHE_HOME` (or `~/.cache`), `%LOCALAPPDATA%` on Windows. */
export function cachePath(env: NodeJS.ProcessEnv, platform = process.platform, home = homedir()): string {
  const base = platform === "win32" ? (env.LOCALAPPDATA ?? join(home, "AppData", "Local")) : env.XDG_CACHE_HOME || join(home, ".cache");
  return join(base, "cloudsesame", "checks.json");
}

// Environment that changes who a check runs as (profiles, config dirs, tokens). Part of the key, hashed, so switching
// `AWS_PROFILE` or a token never reuses a result, and no value is written to disk.
const IDENTITY_ENV = /^(AWS_|CLOUDSDK_|GOOGLE_|AZURE_|ARM_|CLOUDFLARE_|SENTRY_)/;

/** The same target, checked with the same identity environment. */
export function cacheKey(target: Target, env: NodeJS.ProcessEnv): string {
  const tokenEnv = (target.target as { tokenEnv?: string }).tokenEnv;
  const identity = Object.entries(env)
    .filter(([name]) => IDENTITY_ENV.test(name) || name === tokenEnv)
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify([target.provider, target.target, identity])).digest("hex");
}

interface Entry {
  /** When the target passed, in ms since the epoch. */
  at: number;
  statuses: Status[];
}

interface CacheFile {
  version: 1;
  entries: Record<string, Entry>;
}

async function load(deps: Deps, path: string): Promise<CacheFile> {
  try {
    const data = JSON.parse((await deps.readFile(path)) ?? "") as CacheFile;
    if (data.version === 1 && data.entries && typeof data.entries === "object") return data;
  } catch {}
  return { version: 1, entries: {} };
}

/** Statuses of a target that passed less than `ttl` ago, or undefined. */
export async function readCache(keys: string[], ttl: number, deps: Deps): Promise<Array<Status[] | undefined>> {
  const { entries } = await load(deps, cachePath(deps.env));
  const now = deps.now();
  return keys.map((key) => {
    const entry = entries[key];
    return entry && now - entry.at >= 0 && now - entry.at < ttl && Array.isArray(entry.statuses) ? entry.statuses : undefined;
  });
}

/** Remember targets that passed (`statuses`), forget the ones that didn't (`undefined`). Never throws. */
export async function writeCache(updates: Map<string, Status[] | undefined>, deps: Deps): Promise<void> {
  if (updates.size === 0) return;
  const path = cachePath(deps.env);
  // Re-read just before writing, to keep what other runs wrote meanwhile.
  const data = await load(deps, path);
  const now = deps.now();
  for (const [key, entry] of Object.entries(data.entries)) if (!(now - entry.at < MAX_AGE)) delete data.entries[key];
  for (const [key, statuses] of updates) {
    if (statuses) data.entries[key] = { at: now, statuses };
    else delete data.entries[key];
  }
  await deps.writeFile(path, JSON.stringify(data));
}
