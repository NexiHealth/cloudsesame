# Installation

cloudsesame ships as an npm package and as standalone binaries. Pick whichever fits how you install tools.

::: code-group

```sh [npm / Bun]
bunx cloudsesame            # run once, no install
npx cloudsesame
bun add -g cloudsesame      # or install globally
npm install -g cloudsesame
```

```sh [Homebrew]
# macOS and Linux
brew install NexiHealth/tap/cloudsesame
```

<!-- winget is disabled for now (skip_upload in .goreleaser.yaml). Restore this tab once NexiHealth.cloudsesame is in microsoft/winget-pkgs:
```sh [winget]
winget install NexiHealth.cloudsesame
```
-->

```sh [Scoop]
scoop bucket add NexiHealth https://github.com/NexiHealth/scoop-bucket
scoop install cloudsesame
```

```sh [Chocolatey]
choco install cloudsesame
```

:::

## Standalone binary

Download the archive for your platform from the [latest release](https://github.com/NexiHealth/cloudsesame/releases/latest), extract it and put `cloudsesame` on your `PATH`.

## As a dev dependency

To run it from `package.json` scripts and get autocompletion in `sesame.config.ts`, add it to the project:

```sh
bun add -d cloudsesame      # or: npm i -D cloudsesame / pnpm add -D cloudsesame
```

This is optional: the config's `import type` is erased at runtime, so the project doesn't need cloudsesame installed to load it.

## Requirements

| | |
| --- | --- |
| **Runtime** | The npm package runs on Node ≥ 18 or Bun. The binaries need nothing. |
| **Interactive UI** | Node ≥ 22, Bun, or the binaries. Older Node gets plain output (as with `--plain`). |
| **TypeScript config** | Loads in Bun, the binaries and Node 22.18+. On older Node, use [`sesame.config.json`](./configuration#json). |
| **Cloud CLIs** | Whichever you check: [gcloud](https://cloud.google.com/sdk/docs/install), [aws](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), [az](https://learn.microsoft.com/cli/azure/install-azure-cli), [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/). A missing CLI is reported as not ready, with its install link. For `cloudflare`, Cloudflare's `cf` CLI needs no install: it runs through Bun (or through the binaries themselves), and cloudsesame offers to install Bun if there's no way to run it. |

## Shell integration

For OpenTofu with Cloudflare, export the token from your `cf` login into the current shell, then run `tofu` as usual:

```sh
eval "$(cloudsesame env)"
tofu plan
```

See [Shell integration](./shell) for fish, PowerShell, and running `tofu` through cloudsesame instead.

## Check it works

```sh
cloudsesame --version
cloudsesame check       # report only, never prompts
```
