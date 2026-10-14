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
    const mod = await import(pathToFileURL(path).href);
    return mod.default ?? mod;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (/\.m?ts$/.test(path) && (code === "ERR_UNKNOWN_FILE_EXTENSION" || code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING")) {
      throw new ConfigError(
        `Can't load ${path} on Node ${process.versions.node}. Use Node >= 22.18, run through bunx, or switch to sesame.config.json.`,
      );
    }
    throw new ConfigError(`Can't load ${path}: ${(error as Error).message}`);
  }
}
