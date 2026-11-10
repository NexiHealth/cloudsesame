# wrangler

Checks the login that `wrangler deploy`, `wrangler dev` and other Workers commands use. For OpenTofu/Terraform on Cloudflare, use [`cloudflare`](./cloudflare) instead ([why](./cloudflare#wrangler-or-cloudflare)).

```ts
wrangler: { account: "Acme" }
```

## Options

| Field | Default | Description |
| --- | --- | --- |
| `account` | | Account (ID or name) the login must reach, e.g. the `account_id` in your wrangler config. |

## Checks

One check, `wrangler whoami --json`, which shows what wrangler will deploy with:

| Problem | Fix |
| --- | --- |
| Not logged in, or the OAuth login expired and can't be refreshed | `wrangler login` |
| Logged in, but `account` isn't among the accounts the login can reach (`mismatch`) | `wrangler login` (as someone with access) |
| `CLOUDFLARE_API_TOKEN` is set but invalid | None: wrangler prefers the token and `wrangler login` refuses to run while it's set. Fix or unset the variable. |

The line is labeled `login` for the OAuth login, or `token` when `CLOUDFLARE_API_TOKEN` (or `CLOUDFLARE_API_KEY`) is set. The identity shown is your email, or the account for account-owned tokens.

## Quirks

- wrangler is often a project dependency rather than a global install. It's found when cloudsesame runs from a package script (`node_modules/.bin` is on the `PATH`), or install it globally.
- wrangler's OAuth login only has Workers-related scopes: it can't manage DNS records, even with `zone:read`.
- With no config, `wrangler` is checked when it's installed, like the other CLIs.
