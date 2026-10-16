# Contributing

cloudsesame is a Bun + TypeScript CLI with an [Ink](https://github.com/vadimdemedes/ink) UI. [AGENTS.md](AGENTS.md) describes the code layout and the rules to follow (for people and coding agents alike).

## Development

```sh
bun install
bun run dev -- check        # run from source
bun run preview:vault       # play the open-sesame animation
bun run render:banner       # re-render the README banner and docs/public images from the animation
bun test
bun run typecheck
bun run build               # npm bundle, config schema and types -> dist/
bun run build:bin           # standalone binaries for all platforms -> bin/
bun run release:snapshot    # full GoReleaser dry run -> dist-release/ (needs goreleaser installed)
bun run docs:dev            # VitePress docs at http://localhost:5173
```

When you change commands, flags, config or exit codes, update `docs/guide/`, `skills/cloudsesame/SKILL.md` and the README.

## Distribution

| Channel              | How                                                                   | Built by                |
| -------------------- | --------------------------------------------------------------------- | ----------------------- |
| npm (`bunx`/`npx`)   | JS bundle in `dist/cli.js`, runs on Node ≥ 18 or Bun                  | `release.yml` → `npm`   |
| GitHub Releases      | Standalone binaries (`bun build --compile`) for linux/macOS/windows   | GoReleaser              |
| Homebrew             | Cask in `NexiHealth/homebrew-tap`                                     | GoReleaser              |
| Scoop                | Manifest in `NexiHealth/scoop-bucket`                                 | GoReleaser              |
| winget               | PR to `microsoft/winget-pkgs` from the `NexiHealth/winget-pkgs` fork  | GoReleaser              |
| Chocolatey           | `packaging/chocolatey`, packed on a Windows runner                    | `release.yml` → `chocolatey` |

## Releasing

```sh
git tag v0.1.0 && git push origin v0.1.0
```

`release.yml` runs GoReleaser (binaries, GitHub Release, Homebrew, Scoop, winget), then publishes to npm (the version comes from the tag), then Chocolatey. `package.json` stays at `0.0.0` in the repo.

### One-time setup

1. Create the repos `NexiHealth/homebrew-tap` and `NexiHealth/scoop-bucket`, and fork `microsoft/winget-pkgs` to `NexiHealth/winget-pkgs`.
2. Add these to the GitHub repo settings:
   - Secret `PACKAGES_GITHUB_TOKEN`: a PAT with `contents: write` on the tap, the bucket and the winget fork (plus `pull_requests: write` on the fork).
   - Secret `NPM_TOKEN` for the first npm publish. After that, set up [trusted publishing](https://docs.npmjs.com/trusted-publishers) for `release.yml` and delete the token.
   - Secret `CHOCOLATEY_API_KEY` from your chocolatey.org account. The Chocolatey job is skipped while it's unset.
   - Variable `WINGET_ENABLED=true` once the winget fork exists.
3. Enable GitHub Pages with source **GitHub Actions** for the docs.
