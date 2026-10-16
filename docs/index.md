---
layout: home
title: Open sesame for your clouds

hero:
  name: cloudsesame
  text: Open sesame for your clouds.
  tagline: Checks that you're online and logged in to gcloud, aws and az before you work, and logs you in when you're not.
  image:
    src: /vault.png
    alt: A vault door in a brick wall, swung open on a golden glow
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Recipes
      link: /guide/recipes
    - theme: alt
      text: GitHub
      link: https://github.com/NexiHealth/cloudsesame

features:
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/></svg>'
    title: Connectivity first
    details: It knows you're offline before it tries to log you in. predev lets you carry on offline; auth stops.
    link: /guide/commands#predev
    linkText: predev
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>'
    title: Every login that matters
    details: gcloud user and Application Default Credentials, AWS SSO and console login, Azure. Tokens are tested, not just cached.
    link: /guide/providers
    linkText: Providers
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
    title: The right account
    details: Pin the gcloud account, project and quota project, the AWS account ID, the Azure tenant and subscription. Wrong ones count as not ready.
    link: /guide/configuration#providers
    linkText: Configuration
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>'
    title: One-key fixes
    details: It runs the exact command for you, like aws sso login --profile prod, then checks again. Or skip, or stop.
    link: /guide/commands#auth-default
    linkText: auth
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><path d="M8 16h.01"/><path d="M16 16h.01"/></svg>'
    title: Safe in CI and agents
    details: No terminal, no prompt. Clear exit codes, the command to run, --json output, and an Agent Skill for coding agents.
    link: /guide/agents
    linkText: CI and AI agents
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/></svg>'
    title: Config in your repo
    details: A typed sesame.config.ts (or JSON with a schema) with no secrets. Commit it and everyone checks the same things.
    link: /guide/configuration
    linkText: Configuration
---

<div class="cs-section cs-split">
<div>

<p class="cs-eyebrow">Why</p>

## Catch the expired login before your command does

You run `bun dev` or `tofu plan`. Halfway through, it dies with `invalid_grant`, `ExpiredToken` or `AADSTS700082`. You look up the right login command, log in, and run it again.

cloudsesame checks everything in a few seconds before you start, and offers the exact fix:

<ul class="cs-checklist">
<li><b>Log in</b> runs the provider's login, then checks again.</li>
<li><b>Skip</b> carries on without that provider.</li>
<li><b>Stop</b> exits, so nothing runs half-authenticated.</li>
</ul>

</div>
<div>
<Terminal />
</div>
</div>

<div class="cs-section">

<p class="cs-eyebrow">Install</p>

## Pick your package manager

<p class="cs-lead">The npm package runs on Node ≥ 18 or Bun; the interactive UI needs Node ≥ 22 (older versions get plain output). Standalone binaries need no runtime.</p>

::: code-group

```sh [npm / Bun]
bunx cloudsesame            # run without installing
npx cloudsesame
npm install -g cloudsesame  # or: bun add -g cloudsesame
```

```sh [Homebrew]
brew install NexiHealth/tap/cloudsesame
```

```sh [winget]
winget install NexiHealth.cloudsesame
```

```sh [Scoop]
scoop bucket add NexiHealth https://github.com/NexiHealth/scoop-bucket
scoop install cloudsesame
```

```sh [Chocolatey]
choco install cloudsesame
```

```sh [Binary]
# Download the archive for your platform from
# https://github.com/NexiHealth/cloudsesame/releases/latest
# extract it and put `cloudsesame` on your PATH.
```

:::

</div>

<div class="cs-section cs-split even">
<div>

<p class="cs-eyebrow">Configure</p>

## One file, committed with your code

`cloudsesame init` writes a starter config from the CLIs you have installed. It holds no secrets: just what to check and what counts as ready.

No config at all? cloudsesame checks every cloud CLI you have installed, with default settings.

Then hook it into your scripts: `predev` runs before `dev` and is lenient, a group like `infra` makes sure everything a `tofu plan` needs is logged in.

<div class="cs-actions" style="margin-top: 24px">
<a class="brand" href="./guide/configuration">Configuration reference</a>
</div>

</div>
<div>

::: code-group

```ts [sesame.config.ts]
import type { Config } from "cloudsesame";

export default {
  gcloud: { credentials: "adc", project: "acme-dev" },
  aws: [
    { profile: "staging", accountId: "111111111111" },
    { profile: "prod", accountId: "222222222222" },
  ],
  groups: { infra: ["gcloud", "aws"] },
} satisfies Config;
```

```json [sesame.config.json]
{
  "$schema": "https://unpkg.com/cloudsesame/dist/schema.json",
  "gcloud": { "credentials": "adc", "project": "acme-dev" },
  "aws": [
    { "profile": "staging", "accountId": "111111111111" },
    { "profile": "prod", "accountId": "222222222222" }
  ],
  "groups": { "infra": ["gcloud", "aws"] }
}
```

```jsonc [package.json]
{
  "scripts": {
    "predev": "cloudsesame predev",          // before `dev`: lenient, skipping is fine
    "auth": "cloudsesame infra",             // log in to everything infra needs
    "plan": "cloudsesame infra && tofu plan" // never start a plan with expired credentials
  }
}
```

:::

</div>
</div>

<div class="cs-section">

<p class="cs-eyebrow">Automation</p>

## Never hangs, always says why

<p class="cs-lead">Without a terminal, prompts become failures with the command to run, or skips with <code>--skip</code>. Scripts, CI and agents branch on the exit code.</p>

<div class="cs-exit-codes">
<div><b>0</b>Ready</div>
<div><b>1</b>Unexpected error</div>
<div><b>2</b>Invalid arguments or config</div>
<div><b>3</b>Offline</div>
<div class="hot"><b>4</b>A provider isn't ready</div>
<div><b>5</b>You chose Stop</div>
<div><b>130</b>Interrupted with Ctrl-C</div>
</div>

</div>

<div class="cs-cta">

<h2>Stop rerunning <code>tofu plan</code> after a login.</h2>

<p>Set it up once in your repo, and every run starts online and logged in to the right accounts.</p>

<div class="cs-actions">
<a class="brand" href="./guide/getting-started">Get started</a>
<a class="alt" href="./guide/recipes">Browse recipes</a>
</div>

</div>
