# aws

Checks AWS CLI profiles, which AWS SDKs and OpenTofu/Terraform read too.

```ts
aws: [{ profile: "staging", accountId: "111111111111" }, { profile: "prod", accountId: "222222222222" }]
```

## Options

| Field | Default | Description |
| --- | --- | --- |
| `profile` | `AWS_PROFILE`, then `default` | Profile from `~/.aws/config`. |
| `accountId` | | Expected 12-digit AWS account ID. |

## Checks

One check per profile, labeled with the profile name:

1. `aws sts get-caller-identity --profile <profile>` proves the credentials work. On success, the identity shown is the caller ARN.
2. With `accountId`, the account must match. A mismatch has no automatic fix: switch to a profile for the right account.
3. If the profile doesn't exist, that's an `error`, fixed by creating it: `aws configure sso --profile <profile>` asks for your IAM Identity Center details, then signs you in.
4. Otherwise it's not logged in, and cloudsesame picks the login the profile is configured for:

| Profile has | Fix |
| --- | --- |
| `sso_session` or `sso_start_url` | `aws sso login --profile <profile>` |
| `login_session` (console login) | `aws login --profile <profile>` |
| Neither | No fix. The message points you to `aws configure sso`. |

## Permissions

Not supported yet. AWS's equivalent (`iam simulate-principal-policy`) needs IAM read permissions that most SSO users don't have, so it would usually report "can't tell".

## Quirks

- Without `profile` in the config, the commands run without `--profile`, so the AWS CLI's own default applies (`AWS_PROFILE`, then `default`).
- Two profiles for two accounts are two targets, each with its own login line.
