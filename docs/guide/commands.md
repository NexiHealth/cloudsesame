# Commands

## `check [providers|groups...]`

Reports connectivity and login status for each configured provider. Never prompts, so it's safe in CI and scripts. Arguments narrow the check to providers (`gcloud`, `aws`, `az`) or [groups](./configuration#options).

```sh
cloudsesame check
cloudsesame check aws
cloudsesame check infra --json
```

Each failing check prints the command that fixes it (usually a login).

## Global options

| Option | Description |
| --- | --- |
| `-c`, `--config <file>` | Config file. Default: nearest `sesame.config.*` up to the git root |
| `--json` | JSON output |
| `--plain` | Plain text output, no colors or interactive UI. Also enabled by `CLOUDSESAME_PLAIN=1`, and automatically on Node < 22 |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Everything is ready |
| 1 | Unexpected error |
| 2 | Invalid arguments or config |
| 3 | Offline |
| 4 | A provider isn't authenticated, has the wrong account/project, or its CLI is missing |
| 5 | Stopped by the user |
