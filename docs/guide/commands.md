# Commands

```
cloudsesame [command] [providers|groups...] [options]
```

| Command | What it does |
| --- | --- |
| [`auth`](#auth-default) | Make sure you're logged in; offers to log in. The default command. |
| [`predev`](#predev) | Connectivity check, then auth. Skipping is allowed. |
| [`check`](#check) | Report connectivity and login status. Never prompts. |
| [`init`](#init) | Write a starter `sesame.config.ts`. |

All commands except `init` take providers (`gcloud`, `aws`, `az`) or [groups](./configuration#groups) to narrow what's checked. Without them, everything configured is checked (or every installed CLI, with no config).

## `auth` (default)

```sh
cloudsesame            # same as: cloudsesame auth
cloudsesame aws        # same as: cloudsesame auth aws
cloudsesame infra      # same as: cloudsesame auth infra (a group)
```

Checks each provider and, when one isn't ready, asks:

- **Log in** runs the provider's fix, e.g. `aws sso login --profile dev`, then checks again. Shown as **Fix** when the fix isn't a login (like `gcloud config set project`), and as **Retry** after a failed attempt.
- **Skip** continues without it.
- **Stop** exits with code 5.

Being offline is an error (exit 3): there's nothing to authenticate against.

## `predev`

Like `auth`, but checks connectivity first and lets you continue offline. Meant for `package.json`:

```json
{
  "scripts": {
    "predev": "cloudsesame predev"
  }
}
```

## `check`

Reports connectivity and status. Never prompts or logs in. Exit code 4 if anything isn't ready.

```sh
cloudsesame check
cloudsesame check --json   # machine-readable, see CI and AI agents
```

## `init`

Writes `sesame.config.ts` (or `sesame.config.json` with `--json`) in the current directory, based on the installed CLIs and their current project, profile and subscription. `--force` overwrites an existing config. In a terminal, it then offers to install the [Agent Skill](./agents#agent-skill) with `bunx skills add NexiHealth/cloudsesame`.

## Options

| Option | Description |
| --- | --- |
| `--skip` | Never prompt or fail: skip providers that aren't ready, continue offline |
| `-y`, `--yes` | Never prompt: log in when needed, continue offline |
| `--strict` | Treat skipped providers (and continuing offline) as failures |
| `--offline <policy>` | `prompt` \| `continue` \| `fail` (predev) |
| `--unauthenticated <policy>` | `prompt` \| `login` \| `skip` \| `fail` |
| `--no-input` | Don't prompt, as if there were no terminal |
| `--animation <policy>` | `after-login` \| `always` \| `never` |
| `-c`, `--config <file>` | Config file. Default: nearest `sesame.config.*` up to the git root |
| `--json` | JSON output; implies `--no-input`. For `init`, write `sesame.config.json` |
| `--force` | `init`: overwrite an existing config |
| `--plain` | Plain text output, no colors or interactive UI. Also `CLOUDSESAME_PLAIN=1`, and automatic on Node < 22 |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

Precedence: flags > config > defaults. `--offline` and `--unauthenticated` win over `--skip` and `--yes`, which win over the config's [`offline` and `unauthenticated`](./configuration#behavior).

::: info --yes logs in once
With `--yes` (or `unauthenticated: "login"`), each provider gets one login attempt. If it's still not ready after that, the run fails: there's no one to ask whether to retry.
:::

## No terminal

When there's no terminal (CI, agents, piped input) or with `--no-input`, a prompt can't be shown. By default it fails with exit code 4 and prints the commands to run, plus a hint to rerun with `--skip`. Set `noTerminal: "skip"` in the config to skip instead. See [CI and AI agents](./agents).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Ready (skipped providers count as ready unless `--strict`) |
| 1 | Unexpected error |
| 2 | Invalid arguments or config |
| 3 | Offline |
| 4 | A provider isn't ready: not logged in, wrong account/project, missing permissions, or CLI missing |
| 5 | Stopped by the user |
| 130 | Interrupted (Ctrl-C) |
