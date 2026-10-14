// Public config types. Shipped as the package's type declarations (`import type { Config } from "cloudsesame"`),
// so this file must stay types-only. Validation lives in ./schema.ts.

export type ProviderId = "gcloud" | "aws" | "az";

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
}

export interface Config {
  $schema?: string;
  /**
   * When offline:
   * `prompt` asks whether to continue, `continue` warns and continues, `fail` exits.
   * @default "prompt"
   */
  offline?: "prompt" | "continue" | "fail";
  /**
   * When a provider isn't authenticated:
   * `prompt` asks (log in / skip / stop), `login` logs in right away, `skip` warns and continues, `fail` exits.
   * @default "prompt"
   */
  unauthenticated?: "prompt" | "login" | "skip" | "fail";
  /**
   * What a `prompt` becomes when there's no terminal (CI, agents, pipes).
   * @default "fail"
   */
  noTerminal?: "fail" | "skip";
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
}
