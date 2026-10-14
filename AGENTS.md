# AGENTS.md

Bun + TypeScript CLI that checks connectivity and gcloud/aws/az logins before dev or infra work, and helps log in. UI built with Ink (React for the terminal). Ships as an npm package (`bunx cloudsesame`) and as standalone binaries (Homebrew, Scoop, winget, Chocolatey).

## Structure

- `src/cli.ts`: entry point (shebang, calls `run`)
- `src/run.ts`: arg parsing, help, dispatch to plain or Ink, error -> exit code mapping
- `src/command.ts`: `Command` interface (`plain` + `ink`), `Context`, `Flags`
- `src/core/`: UI-free logic. `config/` (types = public API, zod schema, loader), `providers/` (gcloud, aws, az), `check.ts` (target resolution + orchestration), `exec.ts`, `online.ts`, `exit.ts`
- `src/commands/<name>/index.ts`: command definition + plain output; register in `src/commands/index.ts`
- `src/commands/<name>/ink.tsx`: Ink UI for the command (lazy-loaded)
- `src/ui/`: shared UI. `print.ts` (one-shot Ink output), `mode.ts` (plain detection), Ink components, `format.ts` (shared by plain and Ink)
- `src/shims/`: build-time stubs (aliased in `tsconfig.json` `paths`)
- `test/`: `bun test`. `helpers.ts` has `fakeExec` for provider tests
- `scripts/build.ts`: npm build (bundle + `dist/schema.json` + `dist/index.d.ts`)
- `scripts/build-binaries.ts`: local cross-compile to `bin/`
- `docs/`: VitePress site (deployed to GitHub Pages)
- `.goreleaser.yaml`: binaries, GitHub Release, Homebrew, Scoop, winget
- `packaging/chocolatey/`: Chocolatey package template
- `.github/workflows/`: `ci.yml`, `release.yml`, `docs.yml`

## Commands

```sh
bun run dev -- <args>   # run from source
bun test
bun run typecheck
bun run build           # npm bundle, schema, types -> dist/
bun run build:bin       # binaries -> bin/
bun run docs:dev
```

## Rules

- The npm bundle targets Node (`--target node`), so don't use Bun-only APIs in `src/`.
- Get the version from `VERSION` in `src/run.ts`, not `package.json` (release binaries inject it via `--define`).
- Every command implements both `plain` and `ink`. Plain mode = `--plain`, `CLOUDSESAME_PLAIN=1`, or Node < 22.
- Only `ink.tsx` files (and `src/ui/print.ts`) may import `ink`/`react`; load them via `await import("./ink")`. A static import breaks Node 18 (bundle is code-split; ink is its own chunk).
- Ink output: static -> `print(<Comp />)`; interactive -> `render(<App />)` + `await waitUntilExit()`.
- All deps are bundled into `dist/` and the binaries, so add them as `devDependencies`. Keep them few.
- Node >= 18 supported; Ink only on >= 22.
- `src/core/config/types.ts` is the public API (shipped as `dist/index.d.ts`): types only, JSDoc on every field. Keep `schema.ts` in sync (it's typed against it).
- Providers never prompt or log in themselves: they return `Status[]` with a `fix` command. Shell out via the injected `exec`, never directly.
- Exit codes live in `src/core/exit.ts`; document changes in `docs/guide/commands.md`.
- Don't remove the `react-devtools-core` alias in `tsconfig.json`; builds fail without it.
- Update `docs/guide/` when commands change.
- Test plain output via `run([... , "--plain"])`, Ink components with `ink-testing-library`.

## Releases

1. `git tag vX.Y.Z && git push origin vX.Y.Z`
2. `release.yml` runs GoReleaser (binaries, GitHub Release, brew/scoop/winget), then `npm publish` (version comes from the tag), then Chocolatey on Windows.
3. `package.json` version stays `0.0.0` in the repo; don't bump it manually.

Dry run: `bun run release:snapshot` (writes to `dist-release/`; needs `goreleaser`).
