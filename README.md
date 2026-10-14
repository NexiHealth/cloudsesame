# cloudsesame

cloudsesame CLI.

```sh
bunx cloudsesame --help
```

See [the docs](https://OWNER.github.io/cloudsesame/) for all install options (Homebrew, winget, Scoop, Chocolatey, binaries).

## Development

```sh
bun install
bun run dev -- hello        # run from source
bun test
bun run typecheck
bun run build               # npm bundle -> dist/cli.js
bun run build:bin           # standalone binaries for all platforms -> bin/
bun run release:snapshot    # full GoReleaser dry run -> dist-release/ (needs goreleaser installed)
bun run docs:dev            # VitePress docs at http://localhost:5173
```

## Distribution

| Channel              | How                                                                   | Built by                |
| -------------------- | --------------------------------------------------------------------- | ----------------------- |
| npm (`bunx`/`npx`)   | JS bundle in `dist/cli.js`, runs on Node ≥ 18 or Bun                  | `release.yml` → `npm`   |
| GitHub Releases      | Standalone binaries (`bun build --compile`) for linux/macOS/windows   | GoReleaser              |
| Homebrew             | Cask in `OWNER/homebrew-tap`                                          | GoReleaser              |
| Scoop                | Manifest in `OWNER/scoop-bucket`                                      | GoReleaser              |
| winget               | PR to `microsoft/winget-pkgs` from the `OWNER/winget-pkgs` fork       | GoReleaser              |
| Chocolatey           | `packaging/chocolatey`, packed on a Windows runner                    | `release.yml` → `chocolatey` |

### Releasing

```sh
git tag v0.1.0 && git push origin v0.1.0
```

### One-time setup

1. Replace every `OWNER` placeholder (`grep -rn OWNER --exclude-dir=node_modules .`) with your GitHub user/org.
2. Pick a license, add `LICENSE`, and update the `license` fields in `package.json` and `.goreleaser.yaml`.
3. Create the repos `OWNER/homebrew-tap` and `OWNER/scoop-bucket`, and fork `microsoft/winget-pkgs` to `OWNER/winget-pkgs`.
4. Add these to the GitHub repo settings:
   - Secret `PACKAGES_GITHUB_TOKEN`: a PAT with `contents: write` on the tap, the bucket and the winget fork (plus `pull_requests: write` on the fork).
   - Secret `NPM_TOKEN` for the first npm publish. After that, set up [trusted publishing](https://docs.npmjs.com/trusted-publishers) for `release.yml` and delete the token.
   - Secret `CHOCOLATEY_API_KEY` from your chocolatey.org account. The Chocolatey job is skipped while it's unset.
   - Variable `WINGET_ENABLED=true` once the winget fork exists.
5. Enable GitHub Pages with source **GitHub Actions** for the docs.
