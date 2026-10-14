// Local cross-compilation of standalone binaries into ./bin.
// Releases are built by GoReleaser (see .goreleaser.yaml); this is for quick local testing.
//   bun run build:bin                 -> all targets
//   bun run build:bin darwin-arm64    -> selected targets
import { $ } from "bun";

const ALL = ["linux-x64-modern", "linux-arm64", "darwin-x64", "darwin-arm64", "windows-x64-modern"];
const targets = process.argv.length > 2 ? process.argv.slice(2) : ALL;

for (const target of targets) {
  const ext = target.startsWith("windows") ? ".exe" : "";
  const outfile = `bin/cloudsesame-${target}${ext}`;
  await $`bun build src/cli.ts --compile --minify --target=bun-${target} --outfile ${outfile}`;
  console.log(`built ${outfile}`);
}
