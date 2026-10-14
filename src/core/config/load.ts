import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { configSchema } from "./schema";
import type { Config } from "./types";

export const CONFIG_FILES = [
  "sesame.config.ts",
  "sesame.config.mts",
  "sesame.config.js",
  "sesame.config.mjs",
  "sesame.config.json",
];

export class ConfigError extends Error {}

/** Nearest config file from `cwd` upwards, stopping at the git root (or the filesystem root). */
export function findConfig(cwd: string): string | undefined {
  let dir = resolve(cwd);
  while (true) {
    for (const name of CONFIG_FILES) {
      const file = join(dir, name);
      if (existsSync(file)) return file;
    }
    const parent = dirname(dir);
    if (existsSync(join(dir, ".git")) || parent === dir) return undefined;
    dir = parent;
  }
}

export async function loadConfig(opts: { cwd: string; path?: string }): Promise<{ config: Config; path?: string }> {
  const path = opts.path ? resolve(opts.cwd, opts.path) : findConfig(opts.cwd);
  if (!path) return { config: {} };
  if (!existsSync(path)) throw new ConfigError(`Config file not found: ${path}`);

  const raw = path.endsWith(".json") ? readJson(path) : await importModule(path);
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(`Invalid config ${path}:\n${z.prettifyError(parsed.error)}`);
  return { config: parsed.data, path };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ConfigError(`Can't parse ${path}: ${(error as Error).message}`);
  }
}

async function importModule(path: string): Promise<unknown> {
  try {
    const mod = isNativeEsm(path) ? await import(pathToFileURL(path).href) : await importAsEsm(path);
    return mod.default ?? mod;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const code = (error as { code?: string }).code;
    if (/\.m?ts$/.test(path) && (code === "ERR_UNKNOWN_FILE_EXTENSION" || code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING")) {
      throw new ConfigError(unsupportedTs(path));
    }
    throw new ConfigError(`Can't load ${path}: ${(error as Error).message}`);
  }
}

const unsupportedTs = (path: string) =>
  `Can't load ${path} on Node ${process.versions.node}. Use Node >= 22.18, run through bunx, or switch to sesame.config.json.`;

/**
 * Whether `import()` treats the file as an ES module: always in Bun; in Node for .mjs/.mts,
 * or .js/.ts in a package with "type": "module".
 */
function isNativeEsm(path: string): boolean {
  if (process.versions.bun || /\.m[jt]s$/.test(path)) return true;
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) return readJsonSafe(pkg)?.type === "module";
    if (dirname(dir) === dir) return false;
  }
}

/**
 * Node would load the file as CommonJS (no "type": "module"), where `export default` is a syntax error.
 * Load its source as an ES module instead, stripping types for .ts. Relative imports aren't supported this way.
 */
async function importAsEsm(path: string): Promise<{ default?: unknown }> {
  let source = readFileSync(path, "utf8");
  if (path.endsWith(".ts")) {
    const { stripTypeScriptTypes } = (await import("node:module")) as { stripTypeScriptTypes?: (code: string) => string };
    if (typeof stripTypeScriptTypes !== "function") throw new ConfigError(unsupportedTs(path));
    source = withoutWarning("stripTypeScriptTypes", () => stripTypeScriptTypes(source));
  }
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

/** Run `fn` while dropping the process warning that mentions `needle` (e.g. Node's ExperimentalWarning). */
function withoutWarning<T>(needle: string, fn: () => T): T {
  const emitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    if (!String(warning).includes(needle)) (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    return fn();
  } finally {
    process.emitWarning = emitWarning;
  }
}

function readJsonSafe(path: string): { type?: string } | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}
