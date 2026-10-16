# Configuration

cloudsesame looks for the nearest config file from the current directory up to the git root:

`sesame.config.ts` · `sesame.config.mts` · `sesame.config.js` · `sesame.config.mjs` · `sesame.config.json`

Use `--config <file>` to point at one explicitly, or `cloudsesame init` to generate one.

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

## Options

| Option | Default | Description |
| --- | --- | --- |
| `gcloud` | | One target or a list. `credentials`: `user` \| `adc` \| `both` (default `both`), `account`, `project`, `quotaProject` (quota project of user ADC, fixed with `gcloud auth application-default set-quota-project`) |
| `aws` | | One target or a list. `profile` (default `AWS_PROFILE`, then `default`), `accountId` |
| `az` | | One target or a list. `tenant`, `subscription` (ID or name) |
| `groups` | | Named sets of providers: `{ "infra": ["gcloud", "aws"] }` → `cloudsesame check infra` |
| `onlineCheck` | `"www.gstatic.com:443"` | `host:port` probed to detect connectivity, or `false` |
| `timeout` | `20000` | Timeout per check, in ms |
| `offline` | `"prompt"` | `predev` when offline: `prompt` \| `continue` \| `fail` (`auth` always fails offline) |
| `unauthenticated` | `"prompt"` | When a provider isn't ready: `prompt` (log in / skip / stop) \| `login` \| `skip` \| `fail` |
| `noTerminal` | `"fail"` | What `prompt` becomes without a terminal: `fail` \| `skip` |
| `animation` | `"after-login"` | Open-sesame animation when everything is ready: `after-login` \| `always` \| `never`. Never plays without a terminal, in CI, or with `NO_COLOR` |

With no providers configured, every provider whose CLI is installed is checked with default settings.
