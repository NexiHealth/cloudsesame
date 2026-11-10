# az

Checks the Azure CLI login, which Azure SDKs (`AzureCliCredential`) and OpenTofu/Terraform use too.

```ts
az: { tenant: "00000000-0000-0000-0000-000000000000", subscription: "Contoso Dev" }
```

## Options

| Field | Default | Description |
| --- | --- | --- |
| `tenant` | | Expected tenant ID. Also passed to `az login --tenant`. |
| `subscription` | | Expected subscription, by ID or name. |
| `actions` | | RBAC actions you must be allowed, e.g. `["Microsoft.Storage/storageAccounts/read"]`. See [Permissions](#permissions). |
| `dataActions` | | RBAC data actions you must be allowed, e.g. `["Microsoft.CognitiveServices/accounts/OpenAI/deployments/chat/completions/action"]`. |
| `permissionScope` | the subscription | Resource ID to check `actions` and `dataActions` at, e.g. a resource group or resource. |

## Checks

One check per target, labeled with the subscription, else the tenant, else `account`. The identity shown is the signed-in user.

| Problem | How it's found | Fix |
| --- | --- | --- |
| Not logged in or expired | `az account show`, plus `az account get-access-token [--tenant <tenant>]` to prove the refresh token still works | `az login [--tenant <tenant>]` |
| Wrong tenant | Active account's `tenantId` differs from `tenant` | `az login --tenant <tenant>` |
| Wrong subscription | Active subscription's ID and name both differ from `subscription` | `az account set --subscription <subscription>` |

With `actions` or `dataActions`, a second line, **permissions**, checks them once the account, tenant and subscription are right.

## Permissions

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

## Quirks

- `az account show` alone isn't enough: it succeeds from the cache even when the refresh token has expired, so cloudsesame also asks for an access token.
- Deny assignments aren't taken into account in the permissions check.
- On Windows, `az` is a `.cmd` script; cloudsesame runs it through the shell.
