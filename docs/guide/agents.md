# CI and AI agents

cloudsesame is safe to run where no one can answer a prompt. Without a terminal it never hangs: it fails with exit code 4 and prints the exact commands to run, or continues with `--skip`.

## Without a terminal

There's no terminal in CI, in coding agents, with piped input, or with `--no-input` or `--json`. A prompt then becomes what [`noTerminal`](./configuration#behavior) says: `"fail"` (the default) or `"skip"`.

```
✖ Not ready: aws prod
  No terminal to prompt in. Run `aws sso login --profile prod`, or rerun with --skip to continue without it.
```

- `--skip` (or `noTerminal: "skip"`) continues without the provider, and continues offline in `predev`.
- `--strict` makes skipped providers count as failures.
- The open-sesame animation never plays without a terminal, in CI (`CI` set) or with `NO_COLOR`.

See [Recipes: CI pipelines](./recipes#ci-pipelines) for choosing between them.

## JSON output

`cloudsesame check --json` never prompts and prints the result as JSON:

```json
{
  "ok": false,
  "code": 4,
  "online": true,
  "loggedIn": false,
  "results": [
    { "provider": "gcloud", "label": "adc", "state": "ok" },
    {
      "provider": "gcloud",
      "label": "project",
      "state": "mismatch",
      "identity": "acme-sandbox",
      "message": "expected project acme-dev",
      "fix": ["gcloud", "config", "set", "project", "acme-dev"]
    }
  ]
}
```

| Field | Description |
| --- | --- |
| `ok` | `true` when `code` is 0. |
| `code` | The [exit code](./commands#exit-codes). |
| `online` | Result of the connectivity check, or `null` with `onlineCheck: false`. |
| `loggedIn` | Whether a login ran during this run. |
| `results[]` | One entry per check: `provider`, `label`, `state` (`ok` · `unauthenticated` · `mismatch` · `missing` · `error`), and when known `identity`, `message`, `fix` (the command as an argv array) and `skipped`. |

`--json` works with `auth` and `predev` too, and implies `--no-input`. See [Providers](./providers) for what each `label` checks.

## Agent Skill

cloudsesame ships an [Agent Skill](https://github.com/NexiHealth/cloudsesame/blob/main/skills/cloudsesame/SKILL.md) that teaches coding agents to set it up in a project and to handle its failures: ask you to run logins rather than attempting them, and use `--skip` when the task doesn't need the cloud.

`cloudsesame init` offers to install it. Or install it with the [`skills` CLI](https://github.com/vercel-labs/skills), which supports Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot and many more:

```sh
bunx skills add NexiHealth/cloudsesame          # or: npx skills add NexiHealth/cloudsesame
bunx skills add NexiHealth/cloudsesame -g       # for all your projects
bunx skills update                              # pull the latest version later
```

Without the `skills` CLI, copy `skills/cloudsesame/` (also in the npm package, under `node_modules/cloudsesame/skills/`) into your agent's skills folder, e.g. `.claude/skills/`.

::: tip Why agents shouldn't log in
Logins open a browser and need you. The skill tells agents never to pass `--yes` or `--unauthenticated login`, and to show you the printed commands instead.
:::
