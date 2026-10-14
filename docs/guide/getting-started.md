# Getting started

cloudsesame makes sure you're online and logged in to your clouds (gcloud, aws, az) before you work, and logs you in when you're not.

```sh
bunx cloudsesame init   # optional: writes sesame.config.ts from your installed CLIs
bunx cloudsesame        # check, and offer to log in where needed
```

```
✔ online
✖ gcloud user  me@company.com  reauthentication required
  → gcloud auth login --update-adc
✔ gcloud adc
✔ aws dev      arn:aws:sts::123456789012:assumed-role/Admin/me

? gcloud isn't ready.
❯ Log in (l)  gcloud auth login --update-adc
  Skip (s)
  Stop (x)
```

## Before dev

```json
{
  "scripts": {
    "predev": "cloudsesame predev"
  }
}
```

`predev` first checks connectivity (offline: continue with a warning, or stop), then each provider (log in, skip, or stop). Skipping is fine: `dev` still starts.

## Before infra commands

```json
{
  "scripts": {
    "auth": "cloudsesame infra",
    "plan": "cloudsesame infra && tofu plan"
  }
}
```

With `groups: { infra: ["gcloud", "aws"] }` in the config, `cloudsesame infra` makes sure both are logged in, including gcloud Application Default Credentials, which OpenTofu/Terraform use.

## CI and agents

Without a terminal, cloudsesame can't prompt, so anything that would prompt fails with exit code 4 and tells you exactly what to run:

```
✖ Not ready: aws dev
  No terminal to prompt in. Run `aws sso login --profile dev`, or rerun with --skip to continue without it.
```

Pass `--skip` to continue anyway, or set `noTerminal: "skip"` in the config. Use `cloudsesame check --json` for machine-readable status.
