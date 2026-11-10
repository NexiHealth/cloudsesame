# Shell integration

Some tools can't read a CLI's login on their own. OpenTofu's Cloudflare provider is one: it only reads `CLOUDFLARE_API_TOKEN`, so it can't use your [`cf` login](./providers#cloudflare). cloudsesame bridges that gap by passing the login on as a variable, in one of three ways.

A program can't change the environment of the shell that started it, so cloudsesame can't `export` into your terminal by itself. Pick whichever fits how you work:

| | You type | Token |
| --- | --- | --- |
| [Run through cloudsesame](#run-through-cloudsesame) | `cloudsesame infra -- tofu plan` | Fresh every run |
| [Shell functions](#shell-functions) | `tofu plan` | Fresh every run |
| [`eval` the exports](#eval-the-exports) | `eval "$(cloudsesame env)"`, then `tofu plan` | Lasts about an hour |

Other providers' tools read their own logins (gcloud ADC, AWS profiles, az, wrangler), so they work with any of these, or without them.

## Run through cloudsesame

Put the command after [`--`](./commands#run-a-command). cloudsesame checks (and logs in) first, then runs it with the credentials set:

```sh
cloudsesame infra -- tofu plan
```

This works best in `package.json` scripts:

```json
{
  "scripts": {
    "plan": "cloudsesame infra -- tofu plan",
    "apply": "cloudsesame infra -- tofu apply"
  }
}
```

## Shell functions

To keep typing plain `tofu plan`, add one line to your shell's startup file:

::: code-group

```sh [zsh]
# ~/.zshrc
eval "$(cloudsesame shell-init zsh)"
```

```sh [bash]
# ~/.bashrc
eval "$(cloudsesame shell-init bash)"
```

```fish [fish]
# ~/.config/fish/config.fish
cloudsesame shell-init fish | source
```

```powershell [PowerShell]
# $PROFILE
cloudsesame shell-init pwsh | Out-String | Invoke-Expression
```

:::

This defines `tofu` and `terraform` functions:

- **Subcommands that reach the cloud** (`init`, `plan`, `apply`, `destroy`, `import`, `refresh`, `state`, `output`, `show`, `console`, `test`, `taint`, `untaint`, `force-unlock` and `workspace`) run as `cloudsesame auth -- tofu …`. They check the project's clouds, offer logins, and pass on the credentials. Global options are skipped when finding the subcommand, so `tofu -chdir=infra plan` is checked too.
- **Everything else** (`fmt`, `validate`, `version`, …) runs `tofu` directly.
- **Outside a project** with a `sesame.config.*`, `tofu` runs directly, with nothing to check.
- cloudsesame's own output goes to stderr, so `tofu output -json | jq` still gets clean JSON.

To wrap other commands, name them: `cloudsesame shell-init zsh tofu terraform terragrunt`. `cloudsesame` must be on your `PATH` (any [install](./installation) except `bunx`/`npx`).

## `eval` the exports

To set the variables in your current shell:

```sh
eval "$(cloudsesame env)"          # or: cloudsesame env infra, for a group
tofu plan
tofu apply
```

[`env`](./commands#env) runs like `auth`, then prints only `export` lines to stdout. Status, prompts and logins go to stderr, so nothing else gets evaluated. If something isn't ready, it prints nothing and exits non-zero. The syntax follows your shell (`$SHELL`, or PowerShell on Windows), or set it with `--shell sh|fish|pwsh`:

```fish
cloudsesame env --shell fish | source
```

```powershell
cloudsesame env --shell pwsh | Out-String | Invoke-Expression
```

The `cf` login's token lasts about an hour. When `tofu` starts failing with an authentication error, run the `eval` line again, and it refreshes silently. The other two options avoid this by getting a fresh token every run.

::: warning Don't put the token in a file
Writing it to `.env` or `.envrc` leaves a secret on disk that someone could commit, and it stops working after an hour. Running `eval "$(cloudsesame env)"` from direnv's `.envrc` is fine: the token stays in memory. Run `direnv reload` when it expires.
:::
