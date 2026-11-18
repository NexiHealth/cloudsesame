# sentry

For OpenTofu/Terraform on Sentry (the [`jianyuan/sentry`](https://search.opentofu.org/provider/jianyuan/sentry/latest) provider). You log in once with [`sentry-cli`](https://docs.sentry.io/cli/) (`sentry-cli login`), and cloudsesame hands that token to OpenTofu as `SENTRY_AUTH_TOKEN`. No `.tfvars` or `.env` file holding the token.

```ts
sentry: { organization: "acme", scopes: ["project:write", "team:write", "alerts:write"] }
```

```sh
cloudsesame sentry -- tofu plan    # or: eval "$(cloudsesame env sentry)", then tofu plan
```

The OpenTofu provider reads `SENTRY_AUTH_TOKEN` (and `SENTRY_BASE_URL` for self-hosted Sentry), never sentry-cli's login. That's the gap cloudsesame closes.

## Options

| Field | Default | Description |
| --- | --- | --- |
| `tokenEnv` | `"SENTRY_AUTH_TOKEN"` | Environment variable with an auth token to use instead of the sentry-cli login, e.g. in CI. Passed on as `SENTRY_AUTH_TOKEN`. |
| `url` | see [self-hosted](#self-hosted-sentry) | Base URL of a self-hosted Sentry, e.g. `"https://sentry.acme.dev"`. |
| `organization` | | Organization slug the token must reach, e.g. `"acme"`. |
| `scopes` | | Scopes the token must have, e.g. `["project:write", "team:write"]`. A higher level counts: `project:admin` covers `project:write`. |

## Checks

| Check | Runs when | How | Fix |
| --- | --- | --- | --- |
| **login** | `SENTRY_AUTH_TOKEN` isn't set | The token `sentry-cli login` saved in `~/.sentryclirc` must work at `GET /api/0/`, which says who it belongs to and its scopes. With `organization`, it must also reach that organization (`mismatch` otherwise). | `sentry-cli login` |
| **token** | `SENTRY_AUTH_TOKEN` (or `tokenEnv`) is set, e.g. in CI | The same checks, on that token. | None: fix or unset the variable |
| **scopes** | `scopes` is set and the token works | The token's scopes, as `/api/0/` reports them, must cover the list. Otherwise `denied`, e.g. `sentry-cli's token lacks alerts:write`. | None (`denied`): a token's scopes can't change. Create a new one with them and run `sentry-cli login` again. |

## Which token

`sentry-cli login` opens Sentry's **Personal Tokens** page and asks you to paste a token. For OpenTofu, create a [personal token](https://sentry.io/settings/account/api/auth-tokens/) with the scopes your resources need, for example **Project**, **Team** and **Alerts** at *Admin* or *Read & Write*, and **Organization** at *Read*. Put the same list in `scopes`, so a token that's missing one fails before `tofu apply` does.

Organization tokens (`sntrys_…`) are accepted, but they only have the `org:ci` scope (releases and source maps), which isn't enough for most OpenTofu resources.

Personal tokens don't expire unless you revoke them, so unlike [`cloudflare`](./cloudflare) the exported token keeps working.

## Handing the token to OpenTofu

Two ways (see [Shell integration](../shell)):

- `cloudsesame sentry -- tofu plan` (or a group: `cloudsesame infra -- tofu plan`) runs the command with `SENTRY_AUTH_TOKEN` set. Best for `package.json` scripts and agents.
- `eval "$(cloudsesame env)"` exports `SENTRY_AUTH_TOKEN` into your shell; then run `tofu` as usual.

## Self-hosted Sentry

The URL is, in order: `url` in the config, the URL inside an organization token, `SENTRY_URL`, `[defaults] url` in `~/.sentryclirc` (what `sentry-cli --url … login` saves), else `https://sentry.io`. For anything but sentry.io, commands also get `SENTRY_BASE_URL=<url>/api/`, the form the OpenTofu provider expects, and the login fix becomes `sentry-cli --url <url> login`.

## Running `sentry-cli`

You don't need to install it. cloudsesame only runs it to log in: it uses `sentry-cli` if it's on your `PATH`, else runs it with Bun (`bun x @sentry/cli login`), [like `cf`](./cloudflare#running-cf). Only when neither exists is the line `missing`, with Bun's installer as the fix. Checking the token is a direct HTTPS call.

## CI

Set `SENTRY_AUTH_TOKEN` to a token (an [internal integration](https://docs.sentry.io/product/integrations/integration-platform/internal-integration/#auth-tokens) token suits CI). It's verified instead of the sentry-cli login and passed through unchanged. With `tokenEnv: "SENTRY_TF_TOKEN"`, the token is read from that variable and passed on as `SENTRY_AUTH_TOKEN`.

## Quirks

- Only `~/.sentryclirc` is read: not a project-level `.sentryclirc`, `sentrycli.ini` in the config directory, or `SENTRY_PROPERTIES`. Set `url` or `SENTRY_AUTH_TOKEN` if you keep the login elsewhere.
- Organization-level access is checked by reading the organization. Write access can't be tested without changing something, so declare `scopes`.
- With no config, `sentry` isn't checked unless you name it (`cloudsesame sentry`): sentry-cli is common in app repos for source maps, so having it installed doesn't mean the repo needs a login.
- Bun and the standalone binaries honor `HTTPS_PROXY`; Node's built-in `fetch` does not (unless `NODE_USE_ENV_PROXY=1` on Node 24+).
