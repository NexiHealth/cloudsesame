// npm build: code-split bundle (ink is lazy-loaded), config JSON schema and public types.
import { $ } from "bun";
import { copyFileSync, rmSync, writeFileSync } from "node:fs";
import { toJsonSchema } from "../src/core/config/schema";

rmSync("dist", { recursive: true, force: true });
await $`bun build src/cli.ts --target node --minify --splitting --outdir dist`;
writeFileSync("dist/schema.json", `${JSON.stringify(toJsonSchema(), null, 2)}\n`);
copyFileSync("src/core/config/types.ts", "dist/index.d.ts");
console.log("wrote dist/schema.json, dist/index.d.ts");
