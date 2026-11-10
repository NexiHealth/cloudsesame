# Configuration

A config file says which clouds a project needs and what counts as ready. It holds no secrets, so commit it.

## Where it lives

cloudsesame uses the nearest config file, looking from the current directory up to the git root:

`sesame.config.ts` · `sesame.config.mts` · `sesame.config.js` · `sesame.config.mjs` · `sesame.config.json`

Use `--config <file>` (`-c`) to point at one explicitly, or `cloudsesame init` to generate one from your installed CLIs (`--json` for JSON, `--force` to overwrite).

::: tip No config?
With no providers configured, every provider whose CLI is installed is checked with default settings.
:::

## TypeScript

```ts
// sesame.config.ts
import type { Config } from "cloudsesame";

export default {
  gcloud: { credentials: "both", project: "my-project" },
  aws: [{ profile: "dev" }, { profile: "prod", accountId: "123456789012" }],
  groups: { infra: ["gcloud", "aws"] },
} satisfies Config;
```

The `import type` is erased at runtime, so cloudsesame doesn't need to be installed in the project (install it as a dev dependency for editor autocompletion). TypeScript configs load in Bun, the standalone binaries, and Node 22.18+. On older Node, use JSON.

## JSON

```json
{
  "$schema": "https://unpkg.com/cloudsesame/dist/schema.json",
  "gcloud": { "credentials": "adc" },
  "aws": { "profile": "dev" }
}
```

The `$schema` gives you validation and autocompletion in editors that support JSON Schema.

## Providers

Each provider takes one target or a list of targets. Every target is checked separately: two AWS profiles are two checks, each with its own login.

| Provider | Options |
| --- | --- |
| [`gcloud`](./providers/gcloud#options) | `credentials`, `account`, `project`, `quotaProject`, `permissions` |
| [`aws`](./providers/aws#options) | `profile`, `accountId` |
| [`az`](./providers/az#options) | `tenant`, `subscription`, `actions`, `dataActions`, `permissionScope` |
| [`wrangler`](./providers/wrangler#options) | `account` |
| [`cloudflare`](./providers/cloudflare#options) | `tokenEnv`, `accountId`, `zones` |

Each provider's page lists what its options do, what's checked, and its quirks.

## Groups

Name the sets of providers your workflows need, then pass the group name as an argument:

```ts
export default {
  gcloud: { credentials: "adc" },
  aws: { profile: "prod" },
  az: {},
  groups: { infra: ["gcloud", "aws"] },
} satisfies Config;
```

```sh
cloudsesame infra          # auth for gcloud and aws only
cloudsesame check infra    # report for gcloud and aws only
```

Group names work anywhere a provider name does, and you can mix them: `cloudsesame infra az`.

## Behavior

These decide what happens when something isn't ready. [Flags](./commands#options) override them for a single run.

| Option | Default | Description |
| --- | --- | --- |
| `offline` | `"prompt"` | `predev` when offline: `"prompt"` asks whether to continue, `"continue"` warns and continues, `"fail"` exits. `auth` always fails offline. |
| `unauthenticated` | `"prompt"` | When a provider isn't ready: `"prompt"` asks (log in / skip / stop), `"login"` logs in right away, `"skip"` warns and continues, `"fail"` exits. |
| `noTerminal` | `"fail"` | What `"prompt"` becomes without a terminal (CI, agents, pipes): `"fail"` or `"skip"`. |
| `animation` | `"after-login"` | The open-sesame animation when everything is ready: `"after-login"`, `"always"` or `"never"`. Never plays without a terminal, in CI, or with `NO_COLOR`. |

## Connectivity

| Option | Default | Description |
| --- | --- | --- |
| `onlineCheck` | `"www.gstatic.com:443"` | `host:port` probed (TCP) to detect connectivity, or `false` to skip the check. |
| `timeout` | `20000` | Timeout per check, in milliseconds. |

## Validation

An invalid config exits with code 2 and names the field, for example `aws[1].accountId` when an account ID isn't 12 digits, or `gcloud[0].quotaProject` when it's set with `credentials: "user"`, or `gcloud[0].permissions` without a `project`. Unknown fields are errors too, so typos don't go unnoticed.

Ready-made configs for common setups are in [Recipes](./recipes).
