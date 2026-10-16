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

Each provider takes one target or a list of targets. Every target is checked separately: two AWS profiles are two checks, each with its own login. See [Providers](./providers) for exactly what is checked.

### `gcloud`

| Field | Default | Description |
| --- | --- | --- |
| `credentials` | `"both"` | `"user"`: the gcloud CLI login (`gcloud auth login`), for scripts that call `gcloud`. `"adc"`: Application Default Credentials, used by Google SDKs and OpenTofu/Terraform (`gcloud auth application-default login`). `"both"`: both of these. |
| `account` | | Expected active account (email). |
| `project` | | Expected active project ID. |
| `quotaProject` | | Expected quota project of user ADC: the project billed for API quota when SDKs and OpenTofu/Terraform call Google APIs as you. Fixed with `gcloud auth application-default set-quota-project`. Needs `credentials` `"adc"` or `"both"`. Not checked for service account credentials. |
| `permissions` | | IAM permissions you must hold on `project`, e.g. `["aiplatform.endpoints.predict"]`. Missing ones are `denied`. Needs `project`. See [Permissions](./providers#permissions). |

### `aws`

| Field | Default | Description |
| --- | --- | --- |
| `profile` | `AWS_PROFILE`, then `default` | Profile from `~/.aws/config`. |
| `accountId` | | Expected 12-digit AWS account ID. |

### `az`

| Field | Default | Description |
| --- | --- | --- |
| `tenant` | | Expected tenant ID. Also passed to `az login --tenant`. |
| `subscription` | | Expected subscription, by ID or name. |
| `actions` | | RBAC actions you must be allowed, e.g. `["Microsoft.Storage/storageAccounts/read"]`. See [Permissions](./providers#permissions). |
| `dataActions` | | RBAC data actions you must be allowed, e.g. `["Microsoft.CognitiveServices/accounts/OpenAI/deployments/chat/completions/action"]`. |
| `permissionScope` | the subscription | Resource ID to check `actions` and `dataActions` at, e.g. a resource group or resource. |

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
