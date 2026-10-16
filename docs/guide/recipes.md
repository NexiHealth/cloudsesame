# Recipes

Configs for common setups. Copy one, change the names, and run `cloudsesame check` to see where you stand.

<div class="cs-cards">
<a href="#web-app-on-google-cloud"><strong>Web app on Google Cloud</strong><span>SDKs with Application Default Credentials, checked before <code>dev</code>.</span></a>
<a href="#infra-repo-opentofu-on-gcp-and-aws"><strong>Infra repo: GCP + AWS</strong><span>OpenTofu with the right accounts, projects and quota project.</span></a>
<a href="#azure"><strong>Azure</strong><span>Pin the tenant and subscription.</span></a>
<a href="#ai-apis-vertex-ai-and-azure-openai"><strong>AI APIs</strong><span>Check you can call Vertex AI, Speech or Azure OpenAI, not just that you're logged in.</span></a>
<a href="#monorepo"><strong>Monorepo</strong><span>A config per package, or groups in one config.</span></a>
<a href="#never-block-anyone"><strong>Never block anyone</strong><span>Warn about missing logins and carry on.</span></a>
<a href="#ci-pipelines"><strong>CI pipelines</strong><span>Fail fast with the fix, or skip.</span></a>
</div>

## Web app on Google Cloud

Your app talks to Google APIs through the client libraries, which use Application Default Credentials (ADC). Check them before `dev` starts:

::: code-group

```ts [sesame.config.ts]
import type { Config } from "cloudsesame";

export default {
  gcloud: { credentials: "adc", project: "acme-dev" },
} satisfies Config;
```

```json [package.json]
{
  "scripts": {
    "predev": "cloudsesame predev",
    "dev": "vite"
  }
}
```

:::

`credentials` is `"adc"` for code that uses Google SDKs or OpenTofu/Terraform, `"user"` for scripts that call the `gcloud` CLI, and `"both"` (the default) when you're not sure. `project` catches a CLI pointed at the wrong project, and offers `gcloud config set project acme-dev`.

`predev` is lenient: offline, it asks whether to continue; if you skip a login, `dev` still starts.

## Infra repo: OpenTofu on GCP and AWS

OpenTofu/Terraform needs gcloud ADC and AWS credentials, for the right accounts. A plan that starts with expired credentials fails halfway, so check first:

::: code-group

```ts [sesame.config.ts]
import type { Config } from "cloudsesame";

export default {
  gcloud: {
    credentials: "both",
    account: "me@acme.dev",
    project: "acme-prod",
    quotaProject: "acme-billing", // project billed when SDKs call Google APIs as you
  },
  aws: [
    { profile: "staging", accountId: "111111111111" },
    { profile: "prod", accountId: "222222222222" },
  ],
  groups: { infra: ["gcloud", "aws"] },
} satisfies Config;
```

```json [package.json]
{
  "scripts": {
    "auth": "cloudsesame infra",
    "plan": "cloudsesame infra && tofu plan",
    "apply": "cloudsesame infra && tofu apply"
  }
}
```

:::

`cloudsesame infra` checks both clouds. A login to the wrong account or project counts as not ready, and cloudsesame offers the command that fixes it:

- gcloud logged out: `gcloud auth login me@acme.dev --update-adc` (one login for both CLI and ADC).
- Wrong quota project: `gcloud auth application-default set-quota-project acme-billing`.
- AWS SSO session expired: `aws sso login --profile prod`.

Not using `package.json`? Run `cloudsesame infra && tofu plan` from a Makefile, a `justfile` or your shell.

## Azure

Pin the tenant and the subscription (by ID or name):

```ts
import type { Config } from "cloudsesame";

export default {
  az: { tenant: "00000000-0000-0000-0000-000000000000", subscription: "Contoso Dev" },
} satisfies Config;
```

Logged out or in the wrong tenant, cloudsesame offers `az login --tenant 00000000-0000-0000-0000-000000000000`. In the wrong subscription, it offers `az account set --subscription "Contoso Dev"`.

::: warning One subscription at a time
`az` has a single active subscription, so list one subscription per config. For several environments, keep a config file per environment and pick it with `--config`, e.g. `cloudsesame -c sesame.prod.json`.
:::

## AI APIs: Vertex AI and Azure OpenAI

A valid login isn't enough to call a model: you also need the role. List the permissions the code uses, and a missing one shows up before the first request fails:

::: code-group

```ts [Google Cloud]
import type { Config } from "cloudsesame";

export default {
  gcloud: {
    credentials: "adc",
    project: "acme-ai",
    permissions: [
      "aiplatform.endpoints.predict", // Vertex AI / Gemini generateContent
      "speech.recognizers.recognize", // Speech-to-Text v2
    ],
  },
} satisfies Config;
```

```ts [Azure OpenAI]
import type { Config } from "cloudsesame";

export default {
  az: {
    subscription: "Contoso AI",
    dataActions: ["Microsoft.CognitiveServices/accounts/OpenAI/deployments/chat/completions/action"],
    permissionScope:
      "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/ai/providers/Microsoft.CognitiveServices/accounts/contoso-openai",
  },
} satisfies Config;
```

:::

```
✔ gcloud adc
✖ gcloud permissions  acme-ai: missing speech.recognizers.recognize
```

There's nothing to run for a missing permission, so cloudsesame offers **Skip** or **Stop** and exits with code 4 if it stays missing. It checks IAM only: an API that isn't enabled, or a model you have no quota for, still fails at call time. See [Permissions](./providers#permissions) for the details.

## Monorepo

cloudsesame uses the nearest config, looking from the current directory up to the git root. Package scripts run in the package's directory, so each package can have its own:

```
acme/
├─ sesame.config.ts            ← fallback for the rest of the repo
├─ apps/web/sesame.config.ts   ← gcloud ADC only
└─ infra/sesame.config.ts      ← gcloud and aws
```

Configs don't merge: the nearest one wins.

Or keep one config at the root and give each package a group:

::: code-group

```ts [sesame.config.ts]
import type { Config } from "cloudsesame";

export default {
  gcloud: { credentials: "both", project: "acme-dev" },
  aws: { profile: "dev" },
  groups: {
    web: ["gcloud"],
    infra: ["gcloud", "aws"],
  },
} satisfies Config;
```

```json [apps/web/package.json]
{
  "scripts": {
    "predev": "cloudsesame predev web"
  }
}
```

```json [infra/package.json]
{
  "scripts": {
    "plan": "cloudsesame infra && tofu plan"
  }
}
```

:::

A group lists providers, so it includes every target of those providers: with two AWS profiles, `infra` checks both.

## Never block anyone

For a team that wants the reminder but never a blocked script: warn about missing logins, continue offline, and skip the animation.

```ts
import type { Config } from "cloudsesame";

export default {
  gcloud: { credentials: "adc" },
  offline: "continue", // predev: don't ask when offline
  unauthenticated: "skip", // warn about missing logins, never prompt
  animation: "never",
} satisfies Config;
```

Anyone can still log in with `cloudsesame --unauthenticated prompt`, since flags override the config.

## CI pipelines

Scripts like `predev` also run in CI, where there's no terminal to prompt in. By default, anything that would prompt fails with exit code 4 and prints the command to run. Choose what fits the job:

| The job | Use |
| --- | --- |
| Needs the cloud | The default. It fails fast with the fix, before a long job starts. |
| Doesn't need the cloud (lint, unit tests) | `--skip` on that run, or `noTerminal: "skip"` in the config to skip everywhere. |
| Must have everything, skips included | `--strict`: skipped providers count as failures. |

To gate a job on credentials it set up earlier, run `check`. It never prompts and exits 4 if anything isn't ready:

```yaml
# .github/workflows/deploy.yml
- run: npx cloudsesame check infra
```

The runner uses the same config as developers, so the profiles, accounts and projects it names must exist there too.

To read the status from a script, use `--json`:

```sh
cloudsesame check --json | jq -r '.results[] | select(.state != "ok") | "\(.provider) \(.label): \(.message)"'
```

See [CI and AI agents](./agents) for the JSON fields and the Agent Skill.
