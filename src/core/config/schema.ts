import { z } from "zod";
import type { AwsTarget, AzTarget, Config, GcloudTarget } from "./types";

// Normalised to an array before validation so errors point at the exact field (a union would only say "Invalid input").
const oneOrMany = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), z.array(schema));

const gcloud: z.ZodType<GcloudTarget> = z
  .strictObject({
    credentials: z.enum(["user", "adc", "both"]).optional(),
    account: z.string().optional(),
    project: z.string().optional(),
    quotaProject: z.string().optional(),
    permissions: z.array(z.string().regex(/^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+){2}$/, 'must be an IAM permission like "aiplatform.endpoints.predict"')).nonempty().optional(),
  })
  .refine((t) => !(t.quotaProject && t.credentials === "user"), {
    message: 'quotaProject applies to ADC; use credentials "adc" or "both"',
    path: ["quotaProject"],
  })
  .refine((t) => !(t.permissions && !t.project), { message: "permissions are checked on a project; set project", path: ["permissions"] });

const aws: z.ZodType<AwsTarget> = z.strictObject({
  profile: z.string().optional(),
  accountId: z.string().regex(/^\d{12}$/, "must be a 12-digit AWS account ID").optional(),
});

const azureActions = z
  .array(z.string().regex(/^[\w.-]+\/\S+$/, 'must be an Azure action like "Microsoft.Storage/storageAccounts/read"'))
  .nonempty();

const az: z.ZodType<AzTarget> = z
  .strictObject({
    tenant: z.string().optional(),
    subscription: z.string().optional(),
    actions: azureActions.optional(),
    dataActions: azureActions.optional(),
    permissionScope: z.string().regex(/^\/subscriptions\/[^/]+(\/.*)?$/, 'must be a resource ID starting with "/subscriptions/"').optional(),
  })
  .refine((t) => !(t.permissionScope && !t.actions && !t.dataActions), { message: "permissionScope needs actions or dataActions", path: ["permissionScope"] });

export const providerIds = ["gcloud", "aws", "az"] as const;

export const configSchema: z.ZodType<Config> = z
  .strictObject({
    $schema: z.string().optional(),
    offline: z.enum(["prompt", "continue", "fail"]).optional().describe("When offline. Default: prompt"),
    unauthenticated: z
      .enum(["prompt", "login", "skip", "fail"])
      .optional()
      .describe("When a provider isn't authenticated. Default: prompt"),
    noTerminal: z.enum(["fail", "skip"]).optional().describe("What `prompt` becomes without a terminal. Default: fail"),
    animation: z
      .enum(["after-login", "always", "never"])
      .optional()
      .describe("Open-sesame animation when everything is ready. Default: after-login"),
    onlineCheck: z
      .union([z.string().regex(/^[^:\s]+:\d+$/, 'must be "host:port"'), z.literal(false)])
      .optional()
      .describe('host:port probed to detect connectivity, or false. Default: "www.gstatic.com:443"'),
    timeout: z.number().int().positive().optional().describe("Timeout per check in ms. Default: 20000"),
    groups: z
      .record(z.string(), z.array(z.enum(providerIds)))
      .optional()
      .describe("Named sets of providers, e.g. { infra: [gcloud, aws] }"),
    gcloud: oneOrMany(gcloud).optional().describe("Google Cloud target(s)"),
    aws: oneOrMany(aws).optional().describe("AWS target(s)"),
    az: oneOrMany(az).optional().describe("Azure target(s)"),
  })
  .meta({ title: "cloudsesame config" });

/** JSON schema for sesame.config.json. Provider entries accept one object or a list. */
export function toJsonSchema() {
  const schema = z.toJSONSchema(configSchema, { io: "input" }) as { properties: Record<string, Record<string, unknown>> };
  for (const id of providerIds) {
    const { items, type: _, ...rest } = schema.properties[id] as { items: unknown; type: string };
    schema.properties[id] = { ...rest, anyOf: [items, { type: "array", items }] };
  }
  return schema;
}
