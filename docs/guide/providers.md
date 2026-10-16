# Providers

cloudsesame checks three clouds through their own CLIs: `gcloud`, `aws` and `az`. It only reads state and tests tokens. It never logs in on its own: logins happen when you choose **Log in**, or with `--yes`.

Every check ends in one of these states:

| State | Icon | Meaning |
| --- | --- | --- |
| `ok` | <span class="cs-sym ok">✔&#xFE0E;</span> | Ready. |
| `unauthenticated` | <span class="cs-sym err">✖&#xFE0E;</span> | Not logged in, or the login expired. |
| `mismatch` | <span class="cs-sym warn">!</span> | Logged in, but to the wrong account, project, tenant or subscription. |
| `denied` | <span class="cs-sym err">✖&#xFE0E;</span> | Logged in, but missing [permissions](#permissions) you asked for. Logging in again doesn't help, so there's no fix to run: ask an admin for the role. |
| `missing` | <span class="cs-sym err">✖&#xFE0E;</span> | The CLI isn't on your `PATH`. The message links to its install page. |
| `error` | <span class="cs-sym err">✖&#xFE0E;</span> | Something else went wrong, like an unknown AWS profile (fixed with `aws configure sso`). |

Anything other than `ok` makes the target not ready (exit code 4 if it isn't resolved). When there's a command that fixes it, cloudsesame shows it (`→ …`) and offers to run it. After running a fix, it checks that target again, so a target with several problems is fixed one step at a time.

Every check has a [timeout](./configuration#connectivity) (20 s by default), and all providers are checked in parallel.

## gcloud

```ts
gcloud: { credentials: "both", account: "me@acme.dev", project: "acme-dev", quotaProject: "acme-billing" }
```

Up to five checks, each shown as its own line:

| Check | Runs when | How | Fix |
| --- | --- | --- | --- |
| **user** | `credentials` is `"user"` or `"both"` | `gcloud auth print-access-token`. With `account`, the active account (`gcloud config get-value account`) must match. | `gcloud auth login [account] [--update-adc]` |
| **adc** | `credentials` is `"adc"` or `"both"` | `gcloud auth application-default print-access-token` | `gcloud auth application-default login` |
| **quota project** | `quotaProject` is set and ADC works | Reads `quota_project_id` from the ADC file | `gcloud auth application-default set-quota-project <quotaProject>` |
| **project** | `project` is set | `gcloud config get-value project` | `gcloud config set project <project>` |
| **permissions** | `permissions` is set and the login works | [`projects.testIamPermissions`](#permissions) on `project` | None (`denied`) |

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
3. If the profile doesn't exist, that's an `error`, fixed by creating it: `aws configure sso --profile <profile>` asks for your IAM Identity Center details, then signs you in.
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

With `actions` or `dataActions`, a second line, **permissions**, checks them once the account, tenant and subscription are right. See [Permissions](#permissions).

## Permissions

Being logged in doesn't mean you can call the API. List the permissions your code needs, and cloudsesame asks the cloud which ones you have. Anything missing is `denied`, with the names in the message:

```
✖ gcloud permissions  acme-dev: missing aiplatform.endpoints.predict
```

### gcloud: `permissions`

```ts
gcloud: { credentials: "adc", project: "acme-dev", permissions: ["aiplatform.endpoints.predict", "speech.recognizers.recognize"] }
```

- Calls [`projects.testIamPermissions`](https://cloud.google.com/resource-manager/reference/rest/v1/projects/testIamPermissions) on `project`, which returns the subset you hold. Anyone can ask about themselves; no extra role is needed.
- Uses the ADC token when `credentials` is `"adc"` or `"both"` (what SDKs use), else the user login's token.
- Needs `project`. No access to the project at all is `denied` too (`no access to project …`, followed by Google's reason).
- Only project-level IAM: it doesn't see whether the API is enabled, quota, organization policies, or roles granted on a single resource (like a bucket).
- This is a direct HTTPS call, not a gcloud command. Bun and the standalone binaries honor `HTTPS_PROXY`; Node's built-in `fetch` does not (unless `NODE_USE_ENV_PROXY=1` on Node 24+).

Permission names are listed in Google's [permissions reference](https://cloud.google.com/iam/docs/permissions-reference), or with `gcloud iam roles describe roles/<role>`.

### az: `actions`, `dataActions` and `permissionScope`

```ts
az: {
  subscription: "Contoso AI",
  dataActions: ["Microsoft.CognitiveServices/accounts/OpenAI/deployments/chat/completions/action"],
  permissionScope: "/subscriptions/…/resourceGroups/ai/providers/Microsoft.CognitiveServices/accounts/contoso-openai",
}
```

- Reads [`Microsoft.Authorization/permissions`](https://learn.microsoft.com/rest/api/authorization/permissions) at `permissionScope` through `az rest` (so it uses az's login, cloud and proxy settings), and matches your list against each role's actions, with wildcards and exclusions (`notActions`).
- `actions` are control-plane operations (manage resources); `dataActions` are data-plane operations (call the model, read blobs). They're separate because Contributor allows every action (`*`) but no data actions.
- `permissionScope` defaults to the active subscription. Roles assigned lower down (on a resource group or resource) only count when you check at that scope, so point it at the resource your code calls.
- Deny assignments aren't taken into account.

### aws

Not supported yet. AWS's equivalent (`iam simulate-principal-policy`) needs IAM read permissions that most SSO users don't have, so it would usually report "can't tell".

## Connectivity

Before checking any provider, cloudsesame opens a TCP connection to [`onlineCheck`](./configuration#connectivity) (`www.gstatic.com:443` by default) to tell "offline" apart from "logged out". Offline, `auth` and `check` exit with code 3, and `predev` follows the [`offline`](./configuration#behavior) policy. Set `onlineCheck: false` to skip it.
