import { decryptValue } from "@/lib/crypto";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import { db } from "@/server/infrastructure/db";
import { aiModels,aiProviders } from "@/server/infrastructure/db/schema";
import type { ProviderHealth,ProviderRuntimeConfig } from "@/server/infrastructure/providers";
import { getAdapter } from "@/server/infrastructure/providers";
import { and,eq } from "drizzle-orm";

// ─── Provider connection test ──────────────────────────────────────────

export async function testProviderConnection(providerId: string, workspaceId: string): Promise<ProviderHealth> {
  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, providerId), eq(aiProviders.workspaceId, workspaceId)))
    .limit(1);

  if (!provider) {
    throw new Error("Provider not found");
  }

  // Decrypt secrets for runtime config
  let apiKey: string | undefined;
  if (provider.encryptedApiKey) {
    apiKey = await decryptValue(provider.encryptedApiKey);
  }

  let headers: Record<string, string> | undefined;
  if (provider.encryptedHeadersJson) {
    headers = {};
    for (const [k, v] of Object.entries(provider.encryptedHeadersJson as Record<string, string>)) {
      headers[k] = await decryptValue(v);
    }
  }

  const runtimeConfig: ProviderRuntimeConfig = {
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl || undefined,
    authType: provider.authType,
    apiKey,
    headers,
    queryParams: (provider.queryParamsJson as Record<string, string>) || undefined,
    openaiCompatibleApiRoute: normalizeOpenAICompatibleApiRoute(provider.openaiCompatibleApiRoute),
  };

  const adapter = getAdapter(provider.kind);
  const health = await adapter.validateConnection(runtimeConfig);

  // Update health status in DB
  await db
    .update(aiProviders)
    .set({
      healthStatus: health.status,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiProviders.id, providerId));

  return health;
}

// ─── Model CRUD ────────────────────────────────────────────────────────

export interface CreateModelInput {
  providerId: string;
  modelId: string;
  displayName?: string;
  logoUrl?: string | null;
  capabilitiesJson?: Record<string, boolean>;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputTokenCost?: string;
  outputTokenCost?: string;
  imageGenerationConfigJson?: Record<string, unknown>;
  sustainabilityConfigJson?: Record<string, unknown>;
}

export async function createModel(providerId: string, input: CreateModelInput) {
  const { modelId, displayName, logoUrl, capabilitiesJson, contextWindow, maxOutputTokens, inputTokenCost, outputTokenCost, imageGenerationConfigJson, sustainabilityConfigJson } = input;

  const [model] = await db
    .insert(aiModels)
    .values({
      providerId,
      modelId,
      displayName: displayName || modelId,
      logoUrl: logoUrl || null,
      capabilitiesJson: capabilitiesJson || null,
      contextWindow: contextWindow || null,
      maxOutputTokens: maxOutputTokens || null,
      inputTokenCost: inputTokenCost || null,
      outputTokenCost: outputTokenCost || null,
      imageGenerationConfigJson: imageGenerationConfigJson || null,
      sustainabilityConfigJson: sustainabilityConfigJson || null,
      enabled: true,
    })
    .returning();

  return model;
}

export interface UpdateModelInput {
  displayName?: string;
  logoUrl?: string | null;
  capabilitiesJson?: Record<string, boolean>;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputTokenCost?: string;
  outputTokenCost?: string;
  imageGenerationConfigJson?: Record<string, unknown> | null;
  sustainabilityConfigJson?: Record<string, unknown> | null;
  enabled?: boolean;
}

type ModelUpdateRule = {
  key: keyof UpdateModelInput;
  column: string;
  normalize?: (value: unknown) => unknown;
};

export const MODEL_UPDATE_RULES: ModelUpdateRule[] = [
  { key: "displayName", column: "displayName" },
  { key: "logoUrl", column: "logoUrl", normalize: (value) => value ?? null },
  {
    key: "capabilitiesJson",
    column: "capabilitiesJson",
    normalize: (value) => value || null,
  },
  {
    key: "contextWindow",
    column: "contextWindow",
    normalize: (value) => value || null,
  },
  {
    key: "maxOutputTokens",
    column: "maxOutputTokens",
    normalize: (value) => value || null,
  },
  {
    key: "inputTokenCost",
    column: "inputTokenCost",
    normalize: (value) => value || null,
  },
  {
    key: "outputTokenCost",
    column: "outputTokenCost",
    normalize: (value) => value || null,
  },
  {
    key: "imageGenerationConfigJson",
    column: "imageGenerationConfigJson",
    normalize: (value) => value || null,
  },
  {
    key: "sustainabilityConfigJson",
    column: "sustainabilityConfigJson",
    normalize: (value) => value || null,
  },
  { key: "enabled", column: "enabled" },
];
