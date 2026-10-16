# AGENTS.md

Bun + TypeScript CLI that checks connectivity and gcloud/aws/az logins before dev or infra work, and helps log in. UI built with Ink (React for the terminal). Ships as an npm package (`bunx cloudsesame`) and as standalone binaries (Homebrew, Scoop, Chocolatey; winget is disabled for now).

## Structure

- `src/cli.ts`: entry point
- `src/run.ts`: flag parsing, help, command dispatch (default `auth`; `cloudsesame aws` = `auth aws`), error -> exit code
- `src/command.ts`: `Command` (`plain` + `ink`), `Context`, `Flags`
- `src/commands/`: `index.ts` (registry), `flow.ts` (check/auth/predev factory), `init.ts`
- `src/core/`: UI-free logic, never imports `src/ui`
  - `config/`: `types.ts` (public API), `schema.ts` (zod), `load.ts` (find up to git root, TS/JSON)
  - `providers/`: gcloud, aws, az. Each returns `Status[]` with a `fix` command; never prompts or logs in
  - `flow/`: the engine. `run.ts` (online -> checks -> resolve each target), `policy.ts` (flags > config > defaults), `types.ts` (`Ui`, `FlowEvent`, `FlowResult`)
  - `targets.ts`, `check.ts`, `deps.ts` (injectable exec/which/isOnline), `exec.ts`, `online.ts`, `init.ts`, `exit.ts`
- `src/ui/`: front ends implementing `Ui`
  - `plain.ts`: line output + readline prompts
  - `ink/`: lazy-loaded Ink UI. `flow.tsx` (engine <-> React bridge), `flow-app.tsx`, `store.ts` (event reducer), `select.tsx`, `vault.tsx`
  - `vault/scene.ts`: the animation as a pure function (time, size) -> ANSI lines
- `src/shims/`: build-time stubs (aliased in `tsconfig.json` `paths`)
- `test/`: `bun test`. `helpers.ts`: `fakeExec`, `deps()`, `ScriptedUi`
- `scripts/`: `build.ts` (npm: bundle + `dist/schema.json` + `dist/index.d.ts`), `build-binaries.ts`, `preview-vault.tsx`, `render-banner.ts` (README banner and docs images in `docs/public/` from the animation)
- `docs/`: VitePress site (GitHub Pages). Custom theme in `docs/.vitepress/theme/` (`custom.css`, `components/`)
- `skills/cloudsesame/SKILL.md`: Agent Skill for projects that use cloudsesame. Layout follows the `skills` CLI (`bunx skills add NexiHealth/cloudsesame`); also shipped in the npm package. `init` offers to install it (`SKILL_SOURCE` in `src/core/init.ts`)
- `.goreleaser.yaml`, `packaging/chocolatey/`, `.github/workflows/`: distribution and CI

## Commands

```sh
bun run dev -- <args>   # run from source
bun test
bun run typecheck
bun run build           # npm bundle, schema, types -> dist/
bun run build:bin       # binaries -> bin/
bun run preview:vault   # play the animation
bun run docs:dev
```

## Rules

- `src/core` has no UI and no direct side effects: shell out and probe the network through `Deps`.
- New provider: implement `Provider` in `src/core/providers/`, add it to `providers/index.ts`, `providerIds` in `schema.ts`, the target type in `types.ts`, and docs.
- New flow behavior goes in `src/core/flow/run.ts` and is exposed to UIs as `FlowEvent`s; both UIs must handle every event.
- Every command implements `plain` and `ink`. Plain mode = `--plain`, `CLOUDSESAME_PLAIN=1`, or Node < 22.
- Only `src/ui/ink/` (and `scripts/`) may import `ink`/`react`; load them via `await import(...)`. A static import breaks Node 18 (the bundle is code-split; Ink is its own chunk).
- The npm bundle targets Node (`--target node`), so don't use Bun-only APIs in `src/`. Node >= 18 supported; Ink only on >= 22.
- `src/core/config/types.ts` is the public API (shipped as `dist/index.d.ts`): types only, JSDoc on every field. `schema.ts` is typed against it.
- Get the version from `VERSION` in `src/run.ts`, not `package.json` (release binaries inject it via `--define`).
- All deps are bundled into `dist/` and the binaries, so add them as `devDependencies`. Keep them few.
- Don't remove the `react-devtools-core` alias in `tsconfig.json`; builds fail without it.
- Exit codes live in `src/core/exit.ts`; keep `--help` and `docs/guide/commands.md` in sync.
- Tests: engine via `runFlow` + `ScriptedUi` + `fakeExec`; providers via `fakeExec`; Ink components via `ink-testing-library`; e2e via `run([...])` with fake CLIs on PATH.
- Update `docs/guide/`, `skills/cloudsesame/SKILL.md` and `README.md` when commands, flags, config or exit codes change.

## Releases

1. `git tag vX.Y.Z && git push origin vX.Y.Z`
2. `release.yml` runs GoReleaser (binaries, GitHub Release, brew/scoop; winget disabled), then `npm publish` (version comes from the tag), then Chocolatey on Windows.
3. `package.json` version stays `0.0.0` in the repo; don't bump it manually.

Dry run: `bun run release:snapshot` (writes to `dist-release/`; needs `goreleaser`).
