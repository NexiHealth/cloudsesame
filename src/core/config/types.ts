// Public config types. Shipped as the package's type declarations (`import type { Config } from "cloudsesame"`),
// so this file must stay types-only. Validation lives in ./schema.ts.

export type ProviderId = "gcloud" | "aws" | "az" | "cloudflare" | "wrangler";
export type OfflinePolicy = "prompt" | "continue" | "fail";
export type UnauthenticatedPolicy = "prompt" | "login" | "skip" | "fail";
export type NoTerminalPolicy = "fail" | "skip";
export type AnimationPolicy = "after-login" | "always" | "never";

export interface GcloudTarget {
  /**
   * Credentials to require.
   * - `user`: gcloud CLI login (`gcloud auth login`)
   * - `adc`: Application Default Credentials, used by SDKs and OpenTofu/Terraform (`gcloud auth application-default login`)
   * - `both`: both of the above
   * @default "both"
   */
  credentials?: "user" | "adc" | "both";
  /** Expected active account (email). */
  account?: string;
  /** Expected active project ID. */
  project?: string;
  /**
   * Expected quota project of user Application Default Credentials: the project billed for API quota when SDKs and
   * OpenTofu/Terraform call Google APIs as you (`gcloud auth application-default set-quota-project`).
   * Requires `credentials` `adc` or `both`. Not checked for service account credentials.
   */
  quotaProject?: string;
  /**
   * IAM permissions you must hold on `project`, e.g. `["aiplatform.endpoints.predict"]`.
   * Tested with the ADC credentials (the user login with `credentials: "user"`). Requires `project`.
   * Covers project-level IAM only: not whether the API is enabled, nor resource-level policies.
   */
  permissions?: string[];
}

export interface AwsTarget {
  /** Profile from `~/.aws/config`. Defaults to `AWS_PROFILE`, then `default`. */
  profile?: string;
  /** Expected AWS account ID. */
  accountId?: string;
}

export interface AzTarget {
  /** Expected tenant ID (also used for `az login --tenant`). */
  tenant?: string;
  /** Expected subscription ID or name. */
  subscription?: string;
  /**
   * Azure RBAC control-plane actions you must be allowed at `permissionScope`, e.g. `["Microsoft.Storage/storageAccounts/read"]`.
   * Deny assignments aren't taken into account.
   */
  actions?: string[];
  /**
   * Azure RBAC data actions you must be allowed at `permissionScope`, e.g.
   * `["Microsoft.CognitiveServices/accounts/OpenAI/deployments/chat/completions/action"]`.
   * Kept apart from `actions` because roles like Contributor allow every action (`*`) but no data actions.
   */
  dataActions?: string[];
  /**
   * Resource ID to check `actions` and `dataActions` at, e.g. a resource group or resource.
   * Roles assigned below this scope don't count, so use the scope your code calls.
   * @default the active subscription
   */
  permissionScope?: string;
}

/**
 * Cloudflare for OpenTofu/Terraform. Checks the `cf` CLI's login (run with Bun when cf isn't installed), which
 * commands after `--` get as `CLOUDFLARE_API_TOKEN` (`cloudsesame cloudflare -- tofu plan`). When an API token is
 * already set (CI), that token is verified and passed on instead.
 */
export interface CloudflareTarget {
  /**
   * Environment variable with an API token to use instead of the `cf` login, e.g. in CI. Passed to commands after
   * `--` as `CLOUDFLARE_API_TOKEN`, the variable the OpenTofu/Terraform Cloudflare provider reads.
   * @default "CLOUDFLARE_API_TOKEN"
   */
  tokenEnv?: string;
  /**
   * Account ID (32 hex characters). The `cf` login must reach it; also needed to verify account-owned API tokens,
   * and narrows the `zones` lookup to this account.
   */
  accountId?: string;
  /**
   * Zones (domain names) that must be reachable, e.g. `["acme.dev"]`. Each must be visible with readable DNS
   * records. Edit permission can't be tested without writing, so it isn't checked.
   */
  zones?: string[];
}

export interface WranglerTarget {
  /**
   * Account (ID or name) the login must reach, e.g. the `account_id` in your wrangler config.
   * Checked against the accounts `wrangler whoami` lists.
   */
  account?: string;
}

export interface Config {
  $schema?: string;
  /**
   * When offline (`predev`; `auth` always fails offline):
   * `prompt` asks whether to continue, `continue` warns and continues, `fail` exits.
   * @default "prompt"
   */
  offline?: OfflinePolicy;
  /**
   * When a provider isn't authenticated:
   * `prompt` asks (log in / skip / stop), `login` logs in right away, `skip` warns and continues, `fail` exits.
   * @default "prompt"
   */
  unauthenticated?: UnauthenticatedPolicy;
  /**
   * What a `prompt` becomes when there's no terminal (CI, agents, pipes).
   * @default "fail"
   */
  noTerminal?: NoTerminalPolicy;
  /**
   * The open-sesame animation when everything is ready (interactive terminals only).
   * @default "after-login"
   */
  animation?: AnimationPolicy;
  /**
   * `host:port` probed (TCP) to detect connectivity, or `false` to disable the check.
   * @default "www.gstatic.com:443"
   */
  onlineCheck?: string | false;
  /**
   * Timeout per check, in milliseconds.
   * @default 20000
   */
  timeout?: number;
  /** Named sets of providers, e.g. `{ infra: ["gcloud", "aws"] }` -> `cloudsesame auth infra`. */
  groups?: Record<string, ProviderId[]>;
  gcloud?: GcloudTarget | GcloudTarget[];
  aws?: AwsTarget | AwsTarget[];
  az?: AzTarget | AzTarget[];
  cloudflare?: CloudflareTarget | CloudflareTarget[];
  wrangler?: WranglerTarget | WranglerTarget[];
}
