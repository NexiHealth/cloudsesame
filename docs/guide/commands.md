# Commands

All commands take providers (`gcloud`, `aws`, `az`) or [groups](./configuration#options) to narrow what's checked. Without them, everything configured is checked (or every installed CLI, with no config).

## `auth` (default)

```sh
cloudsesame            # same as: cloudsesame auth
cloudsesame aws        # same as: cloudsesame auth aws
```

Checks each provider and, when one isn't ready, asks: **Log in** (runs the provider's login, e.g. `aws sso login --profile dev`, then re-checks), **Skip**, or **Stop**. Being offline is an error (exit 3): there's nothing to authenticate against.

## `predev`

Like `auth`, but checks connectivity first and lets you continue offline. Meant for `"predev": "cloudsesame predev"`.

## `check`

Reports connectivity and status. Never prompts or logs in. Exit code 4 if anything isn't ready.

```sh
cloudsesame check --json
```

## `init`

Writes `sesame.config.ts` (or `sesame.config.json` with `--json`) in the current directory, based on the installed CLIs and their current project/profile/subscription. `--force` overwrites an existing config. In a terminal, it then offers to install the [agent skill](./agents) with `bunx skills add NexiHealth/cloudsesame`.

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
| `--json` | JSON output; implies `--no-input` |
| `--plain` | Plain text output, no colors or interactive UI. Also `CLOUDSESAME_PLAIN=1`, and automatic on Node < 22 |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

Precedence: flags > config > defaults.

## No terminal

When there's no terminal (CI, agents, piped input), a `prompt` can't be shown. By default it fails with exit code 4 and prints the commands to run, plus a hint to rerun with `--skip`. Set `noTerminal: "skip"` in the config to skip instead.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Ready (skipped providers count as ready unless `--strict`) |
| 1 | Unexpected error |
| 2 | Invalid arguments or config |
| 3 | Offline |
| 4 | A provider isn't ready: not logged in, wrong account/project, or CLI missing |
| 5 | Stopped by the user |
| 130 | Interrupted (Ctrl-C) |
