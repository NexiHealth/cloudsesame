# Providers

cloudsesame checks clouds through their own CLIs. It only reads state and tests tokens. It never logs in on its own: logins happen when you choose **Log in**, or with `--yes`.

| Provider | Checks | Use it for |
| --- | --- | --- |
| [`gcloud`](./providers/gcloud) | gcloud login, Application Default Credentials, project, quota project, IAM permissions | Google Cloud SDKs, `gcloud`, OpenTofu/Terraform on GCP |
| [`aws`](./providers/aws) | One AWS profile per target, and its account | AWS SDKs, the `aws` CLI, OpenTofu/Terraform on AWS |
| [`az`](./providers/az) | az login, tenant, subscription, RBAC permissions | Azure SDKs, `az`, OpenTofu/Terraform on Azure |
| [`wrangler`](./providers/wrangler) | wrangler's login or token, and its account | Cloudflare Workers (`wrangler deploy`, `wrangler dev`) |
| [`cloudflare`](./providers/cloudflare) | Cloudflare's `cf` CLI login (or an API token), and zones | OpenTofu/Terraform on Cloudflare (DNS and more) |

Each provider takes one target or a list of targets in the [config](./configuration#providers). Every target is checked separately: two AWS profiles are two checks, each with its own login.

## States

Every check ends in one of these states:

| State | Icon | Meaning |
| --- | --- | --- |
| `ok` | <span class="cs-sym ok">✔&#xFE0E;</span> | Ready. |
| `unauthenticated` | <span class="cs-sym err">✖&#xFE0E;</span> | Not logged in, or the login expired. |
| `mismatch` | <span class="cs-sym warn">!</span> | Logged in, but to the wrong account, project, tenant or subscription. |
| `denied` | <span class="cs-sym err">✖&#xFE0E;</span> | Logged in, but missing [permissions](#permissions) you asked for. Logging in again doesn't help, so there's no fix to run: ask an admin for the role. |
| `missing` | <span class="cs-sym err">✖&#xFE0E;</span> | The CLI isn't on your `PATH`. The message links to its install page. (`cloudflare` instead offers to install Bun, see [cloudflare](./providers/cloudflare#running-cf).) |
| `error` | <span class="cs-sym err">✖&#xFE0E;</span> | Something else went wrong, like an unknown AWS profile (fixed with `aws configure sso`). |

Anything other than `ok` makes the target not ready (exit code 4 if it isn't resolved). When there's a command that fixes it, cloudsesame shows it (`→ …`) and offers to run it. After running a fix, it checks that target again, so a target with several problems is fixed one step at a time.

Every check has a [timeout](./configuration#connectivity) (20 s by default), and all providers are checked in parallel.

## Permissions

Being logged in doesn't mean you can call the API. List the permissions your code needs, and cloudsesame asks the cloud which ones you have. Anything missing is `denied`, with the names in the message:

```
✖ gcloud permissions  acme-dev: missing aiplatform.endpoints.predict
```

- **gcloud:** [`permissions`](./providers/gcloud#permissions), checked on the project.
- **az:** [`actions` and `dataActions`](./providers/az#permissions), checked at a scope you choose.
- **aws:** [not supported yet](./providers/aws#permissions).

## Connectivity

Before checking any provider, cloudsesame opens a TCP connection to [`onlineCheck`](./configuration#connectivity) (`www.gstatic.com:443` by default) to tell "offline" apart from "logged out". Offline, `auth` and `check` exit with code 3, and `predev` follows the [`offline`](./configuration#behavior) policy. Set `onlineCheck: false` to skip it.
