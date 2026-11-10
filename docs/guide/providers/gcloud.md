# gcloud

Checks the Google Cloud logins that the `gcloud` CLI, Google SDKs and OpenTofu/Terraform use.

```ts
gcloud: { credentials: "both", account: "me@acme.dev", project: "acme-dev", quotaProject: "acme-billing" }
```

## Options

| Field | Default | Description |
| --- | --- | --- |
| `credentials` | `"both"` | `"user"`: the gcloud CLI login (`gcloud auth login`), for scripts that call `gcloud`. `"adc"`: Application Default Credentials, used by Google SDKs and OpenTofu/Terraform (`gcloud auth application-default login`). `"both"`: both of these. |
| `account` | | Expected active account (email). |
| `project` | | Expected active project ID. |
| `quotaProject` | | Expected quota project of user ADC: the project billed for API quota when SDKs and OpenTofu/Terraform call Google APIs as you. Needs `credentials` `"adc"` or `"both"`. Not checked for service account credentials. |
| `permissions` | | IAM permissions you must hold on `project`, e.g. `["aiplatform.endpoints.predict"]`. Missing ones are `denied`. Needs `project`. See [Permissions](#permissions). |

## Checks

Up to five, each shown as its own line:

| Check | Runs when | How | Fix |
| --- | --- | --- | --- |
| **user** | `credentials` is `"user"` or `"both"` | `gcloud auth print-access-token`. With `account`, the active account (`gcloud config get-value account`) must match. | `gcloud auth login [account] [--update-adc]` |
| **adc** | `credentials` is `"adc"` or `"both"` | `gcloud auth application-default print-access-token` | `gcloud auth application-default login` |
| **quota project** | `quotaProject` is set and ADC works | Reads `quota_project_id` from the ADC file | `gcloud auth application-default set-quota-project <quotaProject>` |
| **project** | `project` is set | `gcloud config get-value project` | `gcloud config set project <project>` |
| **permissions** | `permissions` is set and the login works | [`projects.testIamPermissions`](#permissions) on `project` | None (`denied`) |

## Permissions

```ts
gcloud: { credentials: "adc", project: "acme-dev", permissions: ["aiplatform.endpoints.predict", "speech.recognizers.recognize"] }
```

- Calls [`projects.testIamPermissions`](https://cloud.google.com/resource-manager/reference/rest/v1/projects/testIamPermissions) on `project`, which returns the subset you hold. Anyone can ask about themselves; no extra role is needed.
- Uses the ADC token when `credentials` is `"adc"` or `"both"` (what SDKs use), else the user login's token.
- No access to the project at all is `denied` too (`no access to project …`, followed by Google's reason).
- Only project-level IAM: it doesn't see whether the API is enabled, quota, organization policies, or roles granted on a single resource (like a bucket).

Permission names are listed in Google's [permissions reference](https://cloud.google.com/iam/docs/permissions-reference), or with `gcloud iam roles describe roles/<role>`.

## Quirks

- With `credentials: "both"`, the user login fix adds `--update-adc`, so one browser login refreshes both credentials.
- The quota project is read from the ADC file: `GOOGLE_APPLICATION_CREDENTIALS` if set, otherwise `application_default_credentials.json` in gcloud's config directory (`CLOUDSDK_CONFIG`, or `~/.config/gcloud`, or `%APPDATA%\gcloud` on Windows). It's only checked for user credentials (`authorized_user`), not service accounts. It's checked once ADC works, so a broken ADC login is fixed first. If the file can't be read, that's an `error`.
- gcloud's long "Reauthentication required" errors are shortened to `reauthentication required`.
- The permissions check is a direct HTTPS call, not a gcloud command. Bun and the standalone binaries honor `HTTPS_PROXY`; Node's built-in `fetch` does not (unless `NODE_USE_ENV_PROXY=1` on Node 24+).
