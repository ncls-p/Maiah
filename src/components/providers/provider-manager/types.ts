import type { OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";

export type ProviderKind =
  | "openai-compatible"
  | "dragonfly"
  | "vercel-ai-gateway"
  | "native";

export type ProviderAuthType =
  | "bearer"
  | "x-api-key"
  | "custom-header"
  | "gateway";

export type SafeProvider = {
  id: string;
  workspaceId: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string | null;
  authType: ProviderAuthType;
  openaiCompatibleApiRoute: OpenAICompatibleApiRoute;
  enabled: boolean;
  healthStatus: string | null;
  lastCheckedAt: string | null;
  hasApiKey: boolean;
  hasCustomHeaders: boolean;
  createdAt: string;
  modelRefresh?: {
    status: "healthy" | "unhealthy" | "manual";
    imported: number;
  } | null;
};

export type ProviderModel = {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string | null;
  logoUrl: string | null;
  capabilitiesJson: Record<string, boolean> | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputTokenCost: string | null;
  outputTokenCost: string | null;
  imageGenerationConfigJson: {
    enabled?: boolean;
    isDefault?: boolean;
    defaultSize?: string;
    allowedSizes?: string[];
    costPerImage?: number;
    energyKwhPerImage?: number;
    co2GramsPerImage?: number;
    currency?: string;
  } | null;
  sustainabilityConfigJson: {
    energyKwhPerMillionTokens?: number;
    co2GramsPerMillionTokens?: number;
    source?: string;
    manualOverride?: boolean;
    currency?: string;
  } | null;
  enabled: boolean;
};

export type ProviderModelUpdate = Partial<
  Pick<
    ProviderModel,
    | "displayName"
    | "capabilitiesJson"
    | "inputTokenCost"
    | "outputTokenCost"
    | "imageGenerationConfigJson"
    | "sustainabilityConfigJson"
    | "enabled"
  >
>;

export type DiscoveredModel = {
  modelId: string;
  displayName?: string;
  description?: string;
  hostedBy?: string;
  capabilities?: Record<string, boolean>;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputTokenCost?: string;
  outputTokenCost?: string;
  imageGeneration?: ProviderModel["imageGenerationConfigJson"];
  sustainability?: ProviderModel["sustainabilityConfigJson"];
};
