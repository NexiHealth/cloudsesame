---
name: cloudsesame
description: Set up and use cloudsesame, the CLI that checks connectivity and gcloud/aws/az logins before dev or infra work. Use when adding cloudsesame to a project (sesame.config.ts, predev/auth scripts, OpenTofu/Terraform auth), when a command fails because cloud credentials are missing or expired, or when `cloudsesame` exits non-zero (codes 2-5).
---

# cloudsesame

`cloudsesame` checks that the machine is online and logged in to gcloud, aws and/or az, and offers to log in when it isn't. Projects run it before `dev` (`predev`) and before infra commands (`auth`).

## Running it as an agent

You have no terminal, so cloudsesame can't prompt. Anything that would prompt fails with **exit code 4** and prints the exact commands that fix it:

```
✖ Not ready: aws dev
  No terminal to prompt in. Run `aws sso login --profile dev`, or rerun with --skip to continue without it.
```

What to do:

1. **The task needs the cloud** (deploying, `tofu plan`, integration tests, anything that calls cloud APIs): **don't run the login commands yourself**. They open a browser and need the user. Show the user the printed commands and ask them to run them (in Claude Code: type `! <command>` in the prompt), then rerun cloudsesame to confirm.
2. **The task doesn't need the cloud** (unit tests, lint, frontend work): rerun with `--skip`. It continues without the provider and exits 0.
3. **To inspect status**, use `cloudsesame check --json`. It never prompts. Fields: `ok`, `code`, `online`, `results[]` with `provider`, `label`, `state` (`ok` | `unauthenticated` | `mismatch` | `missing` | `error`), `identity`, `message`, `fix` (the command, as an argv array).

Never pass `-y`/`--yes` or `--unauthenticated login`: they start interactive logins you can't complete.

### Exit codes

| Code | Meaning | Action |
| --- | --- | --- |
| 0 | Ready (or skipped with `--skip`) | Continue |
| 2 | Bad arguments or invalid config | Read the error; it names the config field (e.g. `aws[1].accountId`) |
| 3 | Offline | Check connectivity, or `predev --skip` to continue offline |
| 4 | A provider isn't ready (logged out, wrong account/project, missing permissions, CLI missing) | See above. For `denied` (missing permissions), logging in doesn't help: tell the user which role to request |
| 5 | The user chose Stop | Don't retry; ask the user |

## Setting it up in a project

1. Add it as a dev dependency (gives config types) and generate a config from the installed CLIs:

   ```sh
   bun add -d cloudsesame      # or npm i -D / pnpm add -D
   bunx cloudsesame init       # writes sesame.config.ts (--json for sesame.config.json)
   ```

   `init` refuses to overwrite an existing config (`--force` to override). Without a terminal it skips the skill-install prompt and prints `bunx skills add NexiHealth/cloudsesame` instead; don't run that unless the user asks (this skill is already installed if you're reading it).

2. Edit `sesame.config.ts` to match what the project actually uses. Only list providers the project needs:

   ```ts
   import type { Config } from "cloudsesame";

   export default {
     gcloud: { credentials: "adc", project: "my-project" },
     aws: [{ profile: "my-dev" }, { profile: "my-prod", accountId: "123456789012" }],
     groups: { infra: ["gcloud", "aws"] },
   } satisfies Config;
   ```

3. Wire it into `package.json`:

   ```json
   {
     "scripts": {
       "predev": "cloudsesame predev",
       "auth": "cloudsesame infra",
       "plan": "cloudsesame infra && tofu plan"
     }
   }
   ```

4. Verify with `bunx cloudsesame check` (exit 0 when ready, 4 with the fix commands otherwise).

### Choosing settings

- **gcloud `credentials`**: `"adc"` for code that uses Google SDKs or OpenTofu/Terraform (Application Default Credentials), `"user"` for scripts that shell out to `gcloud`, `"both"` (default) when unsure. Add `project`/`account` to catch logins to the wrong one. Add `permissions` (with `project`) for the IAM permissions the code needs, e.g. `aiplatform.endpoints.predict` for Vertex AI. Add `quotaProject` (needs ADC) when Google APIs called with user ADC must bill quota to a specific project (`gcloud auth application-default set-quota-project`).
- **aws `profile`**: the profile from `~/.aws/config` the project uses (`aws configure list-profiles`). cloudsesame picks the right login itself (`aws sso login` for SSO profiles, `aws login` for console-login profiles), and offers `aws configure sso --profile <name>` when the profile doesn't exist yet. Add `accountId` to catch the wrong account.
- **az**: `tenant` and/or `subscription` (ID or name) to pin them.
- **`groups`**: name the set of providers a workflow needs, so scripts can run `cloudsesame <group>`.
- **`noTerminal: "skip"`**: only if the project prefers CI and agents to continue silently instead of failing. Default is `"fail"`, which is usually right.
- `predev` is lenient (offline and skipping are allowed); `auth` (the default command, also `cloudsesame <provider|group>`) always fails offline. Add `--strict` to make skips fail.

### Config reference

File: nearest `sesame.config.{ts,mts,js,mjs,json}` from the current directory up to the git root, or `--config <file>`. TS configs load in Bun and Node >= 22.18; use JSON (with `"$schema": "https://unpkg.com/cloudsesame/dist/schema.json"`) if the project runs on older Node without Bun.

| Key | Default | Values |
| --- | --- | --- |
| `gcloud` | | `{ credentials?: "user" \| "adc" \| "both", account?, project?, quotaProject?, permissions?: string[] }` or a list |
| `aws` | | `{ profile?, accountId? }` or a list |
| `az` | | `{ tenant?, subscription?, actions?: string[], dataActions?: string[], permissionScope? }` or a list |
| `groups` | | `{ [name]: ("gcloud" \| "aws" \| "az")[] }` |
| `offline` | `"prompt"` | `"prompt" \| "continue" \| "fail"` (predev) |
| `unauthenticated` | `"prompt"` | `"prompt" \| "login" \| "skip" \| "fail"` |
| `noTerminal` | `"fail"` | `"fail" \| "skip"` |
| `onlineCheck` | `"www.gstatic.com:443"` | `"host:port"` or `false` |
| `timeout` | `20000` | ms per check |
| `animation` | `"after-login"` | `"after-login" \| "always" \| "never"` |

With no config, every installed cloud CLI is checked with default settings.

The config holds no secrets (profiles, project IDs, account IDs), so commit it.

### Useful flags

`--skip` (never prompt or fail) · `--strict` (skips fail) · `--json` (machine output, no prompts) · `--no-input` (behave as without a terminal) · `--plain` (no colors/animation) · `-c <file>` (config path). Full list: `cloudsesame --help`.
