import type { ProviderId } from "../config/types";
import { aws } from "./aws";
import { az } from "./az";
import { gcloud } from "./gcloud";
import type { Provider } from "./types";

// `any`: each provider has its own target type.
export const providers: Record<ProviderId, Provider<any>> = { gcloud, aws, az };
