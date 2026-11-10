# cloudflare

For OpenTofu/Terraform on Cloudflare. You log in once with Cloudflare's [`cf` CLI](https://www.npmjs.com/package/cf) (`cf auth login`, in the browser), and cloudsesame hands that login to OpenTofu as `CLOUDFLARE_API_TOKEN`. You never create, copy or store a token.

```ts
cloudflare: { zones: ["acme.dev"] }
```

```sh
eval "$(cloudsesame env)"          # sets CLOUDFLARE_API_TOKEN in this shell
tofu plan
```

## wrangler or cloudflare?

Cloudflare's tools use different logins:

| You run | It authenticates with | Check with |
| --- | --- | --- |
| `wrangler deploy`, `wrangler dev`, … | `wrangler login` (OAuth), or `CLOUDFLARE_API_TOKEN` when set | [`wrangler`](./wrangler) |
| OpenTofu/Terraform (`cloudflare/cloudflare` provider) | `CLOUDFLARE_API_TOKEN` only (or the legacy `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`, or `CLOUDFLARE_API_USER_SERVICE_KEY`) | `cloudflare` |

The OpenTofu provider never reads a CLI login. And wrangler's login couldn't manage DNS anyway: it only requests Workers-related OAuth scopes. `cloudflare` logs in with the `cf` CLI instead, which gets every scope. A repo that deploys Workers and manages DNS checks both.

## Options

| Field | Default | Description |
| --- | --- | --- |
| `tokenEnv` | `"CLOUDFLARE_API_TOKEN"` | Environment variable with an API token to use instead of the `cf` login, e.g. in CI. Passed on as `CLOUDFLARE_API_TOKEN`. |
| `accountId` | | 32-character account ID. The `cf` login must reach it; needed to verify account-owned tokens; narrows the `zones` lookup. |
| `zones` | | Zones (domain names) the login or token must reach with readable DNS records, e.g. `["acme.dev"]`. |

## Checks

| Check | Runs when | How | Fix |
| --- | --- | --- | --- |
| **login** | `CLOUDFLARE_API_TOKEN` isn't set | `cf auth whoami`, which also refreshes the login. With `accountId`, the login must reach that account. | `cf auth login` (`--force` when it's expired or the wrong account) |
| **token** | `CLOUDFLARE_API_TOKEN` (or `tokenEnv`) is set, e.g. in CI | [`/user/tokens/verify`](https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/verify/) must say it's `active`. With `accountId`, account-owned tokens are verified at `/accounts/<accountId>/tokens/verify`. | None: fix or unset the variable |
| **zones** | `zones` is set and the login or token works | Each zone must be visible, with readable DNS records. Otherwise `denied`, e.g. `acme.dev: no access` or `acme.dev: can't read DNS`. | None (`denied`) |

## Handing the login to OpenTofu

Two ways (see [Shell integration](../shell)):

- `eval "$(cloudsesame env)"` exports `CLOUDFLARE_API_TOKEN` into your shell; then run `tofu` as usual. Rerun it when the token expires.
- `cloudsesame infra -- tofu plan` runs the command with the token set, fresh every time. Best for `package.json` scripts and agents.

The login's access token lasts an hour, and each check refreshes it, so you only see the browser again when `cf`'s refresh token expires. A single command that runs longer than an hour would fail partway.

## Running `cf`

You don't need to install it. cloudsesame uses `cf` if it's on your `PATH`, else runs it with Bun (`bun x cf`): Bun on your `PATH` or in `~/.bun/bin`, or, for the [standalone binaries](../installation) (Homebrew, Scoop, Chocolatey), the binary itself, which is built with Bun. Only when none of those exist (an npm install without Bun) is the line `missing`, with Bun's official installer as the fix (`curl -fsSL https://bun.sh/install | bash`, or `irm bun.sh/install.ps1 | iex` on Windows). After it, cloudsesame goes straight to `cf auth login`.

## CI

Set `CLOUDFLARE_API_TOKEN` to an [API token](https://dash.cloudflare.com/profile/api-tokens) (the **Edit zone DNS** template for DNS records). It's verified instead of the `cf` login and passed through unchanged. With `tokenEnv: "CF_DNS_TOKEN"`, the token is read from that variable and passed on as `CLOUDFLARE_API_TOKEN`.

## Quirks

- `cf` has no command that prints its token, so cloudsesame reads it from the file `cf auth whoami` reports: `cloudflare/config/<profile>.json` in `~/Library/Preferences` (macOS), `~/.config` (Linux) or `%APPDATA%\xdg.config` (Windows), or `XDG_CONFIG_HOME` when set. Named `cf` profiles (`cf auth activate`) work too.
- If `cf` keeps the login in the OS keychain (`CLOUDFLARE_AUTH_USE_KEYRING`), it can't be read: log in with `CLOUDFLARE_AUTH_USE_KEYRING=false cf auth login`.
- `cf` is a technical preview and needs Node 22 or newer when run with Node (it's run with Bun here).
- Edit permission can't be tested without changing something, so **zones** proves read access only.
- With no config, `cloudflare` isn't checked unless you name it (`cloudsesame cloudflare`): there's no CLI to detect.
- Token and zone checks are direct HTTPS calls. Bun and the standalone binaries honor `HTTPS_PROXY`; Node's built-in `fetch` does not (unless `NODE_USE_ENV_PROXY=1` on Node 24+).
