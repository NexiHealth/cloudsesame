# Shell integration

Some tools can't read a CLI's login on their own. OpenTofu's Cloudflare provider is one: it only reads `CLOUDFLARE_API_TOKEN`, so it can't use your [`cf` login](./providers/cloudflare). cloudsesame bridges that gap by handing the login over as that variable, in one of two ways:

| | You type | Token |
| --- | --- | --- |
| [Export it into your shell](#export-it-into-your-shell) | `eval "$(cloudsesame env)"`, then `tofu plan` | Lasts about an hour |
| [Run through cloudsesame](#run-through-cloudsesame) | `cloudsesame infra -- tofu plan` | Fresh every run |

Other providers' tools read their own logins (gcloud ADC, AWS profiles, az, wrangler), so they don't need either.

## Export it into your shell

```sh
eval "$(cloudsesame env)"          # or: cloudsesame env infra, for a group
tofu plan
tofu apply
```

[`env`](./commands#env) runs like `auth`, then prints `export CLOUDFLARE_API_TOKEN='…'`. `eval` runs that line in your shell, so the variable stays set and `tofu` reads it directly, like any other environment variable.

The `eval "$(…)"` is needed because a program can't change the environment of the shell that started it: cloudsesame can only print the line, and your shell runs it (`brew shellenv` and `ssh-agent` work the same way). Only the export goes to stdout. Status, prompts and logins go to stderr, so nothing else gets evaluated. If something isn't ready, it prints nothing and exits non-zero.

The syntax follows your shell (`$SHELL`, or PowerShell on Windows), or set it with `--shell sh|fish|pwsh`:

```fish
cloudsesame env --shell fish | source
```

```powershell
cloudsesame env --shell pwsh | Out-String | Invoke-Expression
```

The `cf` login's token lasts about an hour. When `tofu` starts failing with an authentication error, run the `eval` line again, and it refreshes silently.

::: warning Don't put the token in a file
Writing it to `.env` or `.envrc` leaves a secret on disk that someone could commit, and it stops working after an hour. Running `eval "$(cloudsesame env)"` from direnv's `.envrc` is fine: the token stays in memory. Run `direnv reload` when it expires.
:::

## Run through cloudsesame

Put the command after [`--`](./commands#run-a-command). cloudsesame checks (and logs in) first, then runs it with the token set, fresh every time:

```sh
cloudsesame infra -- tofu plan
```

This works best in `package.json` scripts and for agents:

```json
{
  "scripts": {
    "plan": "cloudsesame infra -- tofu plan",
    "apply": "cloudsesame infra -- tofu apply"
  }
}
```

cloudsesame's own output goes to stderr, so `cloudsesame infra -- tofu output -json | jq` still gets clean JSON.
