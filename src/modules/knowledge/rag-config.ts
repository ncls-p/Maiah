import { and, eq, isNull } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import { isCloudTempleBaseUrl } from "@/modules/provider/cloud-temple-catalog";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  aiProviders,
  appSettings,
} from "@/server/infrastructure/db/schema";
import {
  getAdapter,
  type ProviderRuntimeConfig,
} from "@/server/infrastructure/providers";
import {
  parseRagConfig,
  ragConfigSchema,
  type RagConfig,
} from "@/modules/knowledge/rag-config-schema";

export {
  DEFAULT_RAG_CONFIG,
  hasSameRagModelSelection,
  parseRagConfig,
  ragConfigSchema,
  type RagConfig,
} from "@/modules/knowledge/rag-config-schema";

export const RAG_SETTING_KEY = "rag-defaults";

export async function getDefaultRagConfig(): Promise<RagConfig> {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, RAG_SETTING_KEY));
  return parseRagConfig(row?.valueJson);
}

export async function setDefaultRagConfig(
  config: RagConfig,
  updatedById: string,
) {
  const valueJson = ragConfigSchema.parse(config);
  await db
    .insert(appSettings)
    .values({ key: RAG_SETTING_KEY, valueJson, updatedById })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson, updatedById, updatedAt: new Date() },
    });
  return valueJson;
}

async function toRuntimeConfig(
  provider: typeof aiProviders.$inferSelect,
): Promise<ProviderRuntimeConfig> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    (provider.encryptedHeadersJson as Record<string, string> | null) ?? {},
  )) {
    headers[key] = await decryptValue(value);
  }
  return {
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl ?? undefined,
    authType: provider.authType,
    apiKey: provider.encryptedApiKey
      ? await decryptValue(provider.encryptedApiKey)
      : undefined,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    queryParams:
      (provider.queryParamsJson as Record<string, string> | null) ?? undefined,
    openaiCompatibleApiRoute: provider.openaiCompatibleApiRoute as
      | "responses"
      | "chat-completions",
  };
}

async function resolveProvider(input: {
  workspaceId: string;
  providerId: string | null;
  modelId: string;
}) {
  const rows = await db
    .select({ provider: aiProviders, model: aiModels })
    .from(aiProviders)
    .leftJoin(
      aiModels,
      and(
        eq(aiModels.providerId, aiProviders.id),
        eq(aiModels.modelId, input.modelId),
        eq(aiModels.enabled, true),
      ),
    )
    .where(
      and(
        eq(aiProviders.workspaceId, input.workspaceId),
        eq(aiProviders.enabled, true),
        isNull(aiProviders.archivedAt),
      ),
    );
  const selected = input.providerId
    ? rows.find((row) => row.provider.id === input.providerId)
    : (rows.find(
        (row) =>
          row.model !== null && isCloudTempleBaseUrl(row.provider.baseUrl),
      ) ??
      rows.find((row) => row.model !== null) ??
      rows.find((row) => isCloudTempleBaseUrl(row.provider.baseUrl)));
  if (!selected) return null;
  return {
    provider: selected.provider,
    adapter: getAdapter(selected.provider.kind),
    runtime: await toRuntimeConfig(selected.provider),
  };
}

export async function resolveEmbeddingModel(
  workspaceId: string,
  config: RagConfig,
) {
  if (!config.embedding.modelId) return null;
  const resolved = await resolveProvider({
    workspaceId,
    providerId: config.embedding.providerId,
    modelId: config.embedding.modelId,
  });
  if (!resolved) return null;
  return {
    model: resolved.adapter.createEmbeddingModel(
      resolved.runtime,
      config.embedding.modelId,
    ),
    providerId: resolved.provider.id,
  };
}

export async function resolveRerankingModel(
  workspaceId: string,
  config: RagConfig,
) {
  if (!config.reranking.enabled || !config.reranking.modelId) return null;
  const resolved = await resolveProvider({
    workspaceId,
    providerId: config.reranking.providerId,
    modelId: config.reranking.modelId,
  });
  if (!resolved?.adapter.createRerankingModel) return null;
  return resolved.adapter.createRerankingModel(
    resolved.runtime,
    config.reranking.modelId,
  );
}

export async function resolveOcrModel(workspaceId: string, config: RagConfig) {
  if (!config.extraction.ocr.enabled || !config.extraction.ocr.modelId) {
    return null;
  }
  const resolved = await resolveProvider({
    workspaceId,
    providerId: config.extraction.ocr.providerId,
    modelId: config.extraction.ocr.modelId,
  });
  if (!resolved) return null;
  return {
    model: resolved.adapter.createChatModel(
      resolved.runtime,
      config.extraction.ocr.modelId,
    ),
    providerId: resolved.provider.id,
  };
}
