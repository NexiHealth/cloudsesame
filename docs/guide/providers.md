# Providers

cloudsesame checks three clouds through their own CLIs: `gcloud`, `aws` and `az`. It only reads state and tests tokens. It never logs in on its own: logins happen when you choose **Log in**, or with `--yes`.

Every check ends in one of these states:

| State | Icon | Meaning |
| --- | --- | --- |
| `ok` | <span class="cs-sym ok">✔&#xFE0E;</span> | Ready. |
| `unauthenticated` | <span class="cs-sym err">✖&#xFE0E;</span> | Not logged in, or the login expired. |
| `mismatch` | <span class="cs-sym warn">!</span> | Logged in, but to the wrong account, project, tenant or subscription. |
| `missing` | <span class="cs-sym err">✖&#xFE0E;</span> | The CLI isn't on your `PATH`. The message links to its install page. |
| `error` | <span class="cs-sym err">✖&#xFE0E;</span> | Something else went wrong, like an unknown AWS profile. |

Anything other than `ok` makes the target not ready (exit code 4 if it isn't resolved). When there's a command that fixes it, cloudsesame shows it (`→ …`) and offers to run it. After running a fix, it checks that target again, so a target with several problems is fixed one step at a time.

Every check has a [timeout](./configuration#connectivity) (20 s by default), and all providers are checked in parallel.

## gcloud

```ts
gcloud: { credentials: "both", account: "me@acme.dev", project: "acme-dev", quotaProject: "acme-billing" }
```

Up to four checks, each shown as its own line:

| Check | Runs when | How | Fix |
| --- | --- | --- | --- |
| **user** | `credentials` is `"user"` or `"both"` | `gcloud auth print-access-token`. With `account`, the active account (`gcloud config get-value account`) must match. | `gcloud auth login [account] [--update-adc]` |
| **adc** | `credentials` is `"adc"` or `"both"` | `gcloud auth application-default print-access-token` | `gcloud auth application-default login` |
| **quota project** | `quotaProject` is set and ADC works | Reads `quota_project_id` from the ADC file | `gcloud auth application-default set-quota-project <quotaProject>` |
| **project** | `project` is set | `gcloud config get-value project` | `gcloud config set project <project>` |

- With `credentials: "both"`, the user login fix adds `--update-adc`, so one browser login refreshes both credentials.
- The quota project is read from the ADC file: `GOOGLE_APPLICATION_CREDENTIALS` if set, otherwise `application_default_credentials.json` in gcloud's config directory (`CLOUDSDK_CONFIG`, or `~/.config/gcloud`, or `%APPDATA%\gcloud` on Windows). It's only checked for user credentials (`authorized_user`), not service accounts. It's checked once ADC works, so a broken ADC login is fixed first. If the file can't be read, that's an `error`.
- gcloud's long "Reauthentication required" errors are shortened to `reauthentication required`.

## aws

```ts
aws: [{ profile: "staging", accountId: "111111111111" }, { profile: "prod", accountId: "222222222222" }]
```

One check per profile, labeled with the profile name (`profile`, else `AWS_PROFILE`, else `default`):

1. `aws sts get-caller-identity --profile <profile>` proves the credentials work. On success, the identity shown is the caller ARN.
2. With `accountId`, the account must match. A mismatch has no automatic fix: switch to a profile for the right account.
3. If the profile doesn't exist, that's an `error` with no fix.
4. Otherwise it's not logged in, and cloudsesame picks the login the profile is configured for:

| Profile has | Fix |
| --- | --- |
| `sso_session` or `sso_start_url` | `aws sso login --profile <profile>` |
| `login_session` (console login) | `aws login --profile <profile>` |
| Neither | No fix. The message points you to `aws configure sso`. |

Without `profile` in the config, the commands run without `--profile`, so the AWS CLI's own default applies.

## az

```ts
az: { tenant: "00000000-0000-0000-0000-000000000000", subscription: "Contoso Dev" }
```

One check per target, labeled with the subscription, else the tenant, else `account`:

| Problem | How it's found | Fix |
| --- | --- | --- |
| Not logged in or expired | `az account show`, plus `az account get-access-token [--tenant <tenant>]` to prove the refresh token still works | `az login [--tenant <tenant>]` |
| Wrong tenant | Active account's `tenantId` differs from `tenant` | `az login --tenant <tenant>` |
| Wrong subscription | Active subscription's ID and name both differ from `subscription` | `az account set --subscription <subscription>` |

The identity shown is the signed-in user.

## Connectivity

Before checking any provider, cloudsesame opens a TCP connection to [`onlineCheck`](./configuration#connectivity) (`www.gstatic.com:443` by default) to tell "offline" apart from "logged out". Offline, `auth` and `check` exit with code 3, and `predev` follows the [`offline`](./configuration#behavior) policy. Set `onlineCheck: false` to skip it.
