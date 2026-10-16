# Getting started

cloudsesame makes sure you're online and logged in to your clouds (gcloud, aws, az) before you work, and logs you in when you're not. Run it by hand, before `dev`, before infra commands, or in CI.

<Terminal />

## 1. Run it

```sh
bunx cloudsesame        # or: npx cloudsesame
```

With no config, it checks every cloud CLI you have installed with default settings. For each one that isn't ready, it asks:

- **Log in** runs the provider's login (e.g. `gcloud auth login --update-adc`), then checks again.
- **Skip** carries on without that provider.
- **Stop** exits with code 5.

See [Installation](./installation) for Homebrew, Scoop, Chocolatey and standalone binaries.

## 2. Add a config

```sh
bunx cloudsesame init   # writes sesame.config.ts from your installed CLIs
```

`init` picks up your current gcloud project, AWS profile and Azure subscription. Edit the file to keep only what the project needs, and add the accounts and projects you expect:

```ts
// sesame.config.ts
import type { Config } from "cloudsesame";

export default {
  gcloud: { credentials: "adc", project: "acme-dev" },
  aws: { profile: "dev" },
} satisfies Config;
```

Commit it: it holds no secrets. All options are in [Configuration](./configuration).

## 3. Wire it into your scripts

::: code-group

```json [Before dev]
{
  "scripts": {
    "predev": "cloudsesame predev"
  }
}
```

```json [Before infra commands]
{
  "scripts": {
    "auth": "cloudsesame infra",
    "plan": "cloudsesame infra && tofu plan"
  }
}
```

:::

**`predev`** checks connectivity first (offline: continue with a warning, or stop), then each provider (log in, skip, or stop). Skipping is fine: `dev` still starts.

**`cloudsesame infra`** runs `auth` for a [group](./configuration#groups). With `groups: { infra: ["gcloud", "aws"] }` in the config, it makes sure both are logged in, including gcloud Application Default Credentials, which OpenTofu/Terraform use.

## 4. CI and agents

Without a terminal, cloudsesame can't prompt, so anything that would prompt fails with exit code 4 and tells you exactly what to run:

```
✖ Not ready: aws dev
  No terminal to prompt in. Run `aws sso login --profile dev`, or rerun with --skip to continue without it.
```

Pass `--skip` to continue anyway, or set `noTerminal: "skip"` in the config. Use `cloudsesame check --json` for machine-readable status. More in [CI and AI agents](./agents).

## Next steps

<div class="cs-cards">
<a href="./configuration"><strong>Configuration</strong><span>Every option, with defaults.</span></a>
<a href="./commands"><strong>Commands</strong><span>auth, predev, check, init, flags and exit codes.</span></a>
<a href="./providers"><strong>Providers</strong><span>What each provider checks and the fixes it offers.</span></a>
<a href="./recipes"><strong>Recipes</strong><span>Configs for common setups, ready to copy.</span></a>
</div>
