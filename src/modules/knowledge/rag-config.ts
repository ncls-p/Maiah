import { and, eq, isNull } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import {
  parseRagConfig,
  ragConfigSchema,
  type RagConfig,
} from "@/modules/knowledge/rag-config-schema";
import { isCloudTempleBaseUrl } from "@/modules/provider/cloud-temple-catalog";
import { discoverWorkspaceModels } from "@/modules/provider/use-cases.update-model";
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

export {
  DEFAULT_RAG_CONFIG,
  hasSameRagModelSelection,
  inheritRagConfigDefaults,
  parseRagConfig,
  ragConfigSchema,
  type RagConfig,
} from "@/modules/knowledge/rag-config-schema";

const RAG_SETTING_KEY = "rag-defaults";

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
      "responses" | "chat-completions",
  };
}

const LIVE_CATALOG_TTL_MS = 60_000;
const LIVE_CATALOG_TIMEOUT_MS = 10_000;

type LiveCatalog = Array<{ providerId: string; modelIds: Set<string> }>;

const liveCatalogCache = new Map<
  string,
  { expiresAt: number; catalog: Promise<LiveCatalog> }
>();

async function loadLiveCatalog(workspaceId: string): Promise<LiveCatalog> {
  // discoverWorkspaceModels already isolates each provider failure; the
  // race guards against a provider whose /models endpoint never answers.
  const discovery = discoverWorkspaceModels(workspaceId).then((results) =>
    results.map((result) => ({
      providerId: result.provider.id,
      modelIds: new Set(result.models.map((model) => model.modelId)),
    })),
  );
  const timeout = new Promise<LiveCatalog>((resolve) => {
    setTimeout(() => resolve([]), LIVE_CATALOG_TIMEOUT_MS);
  });
  try {
    return await Promise.race([discovery, timeout]);
  } catch {
    return [];
  }
}

/**
 * Returns the ids of enabled providers whose live model catalog contains the
 * requested model. Results are cached per workspace for a short TTL because
 * this runs at ingestion time and on every knowledge search.
 */
async function liveProviderIdsWithModel(workspaceId: string, modelId: string) {
  const now = Date.now();
  let entry = liveCatalogCache.get(workspaceId);
  if (!entry || entry.expiresAt <= now) {
    entry = {
      expiresAt: now + LIVE_CATALOG_TTL_MS,
      catalog: loadLiveCatalog(workspaceId),
    };
    liveCatalogCache.set(workspaceId, entry);
  }
  const catalog = await entry.catalog;
  return new Set(
    catalog
      .filter((provider) => provider.modelIds.has(modelId))
      .map((provider) => provider.providerId),
  );
}

export function clearLiveCatalogCacheForTesting() {
  liveCatalogCache.clear();
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

  const buildSelection = async (row: (typeof rows)[number]) => ({
    provider: row.provider,
    adapter: getAdapter(row.provider.kind),
    runtime: await toRuntimeConfig(row.provider),
  });

  if (input.providerId) {
    const selected = rows.find((row) => row.provider.id === input.providerId);
    return selected ? buildSelection(selected) : null;
  }

  // First choice: a provider with the model registered and enabled in the
  // ai_models table (cheap, already loaded), Cloud Temple preferred.
  const registered =
    rows.find(
      (row) => row.model !== null && isCloudTempleBaseUrl(row.provider.baseUrl),
    ) ?? rows.find((row) => row.model !== null);
  if (registered) return buildSelection(registered);
  if (rows.length === 0) return null;

  // The RAG settings UI lists live-discovered models, so admins can select a
  // model that was never registered in ai_models. Fall back to the providers'
  // live catalogs before giving up, keeping the Cloud Temple preference.
  const liveProviderIds = await liveProviderIdsWithModel(
    input.workspaceId,
    input.modelId,
  );
  const selected =
    rows.find(
      (row) =>
        liveProviderIds.has(row.provider.id) &&
        isCloudTempleBaseUrl(row.provider.baseUrl),
    ) ??
    rows.find((row) => liveProviderIds.has(row.provider.id)) ??
    rows.find((row) => isCloudTempleBaseUrl(row.provider.baseUrl));
  if (!selected) return null;
  return buildSelection(selected);
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
