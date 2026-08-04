import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

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

export const RAG_SETTING_KEY = "rag-defaults";

export const ragConfigSchema = z
  .object({
    embedding: z.object({
      providerId: z.uuid().nullable().default(null),
      modelId: z.string().trim().max(255).default(""),
      dimensions: z
        .number()
        .int()
        .positive()
        .max(65_535)
        .nullable()
        .default(null),
    }),
    chunking: z.object({
      maxCharacters: z.number().int().min(200).max(20_000).default(1_200),
      overlapCharacters: z.number().int().min(0).max(4_000).default(160),
    }),
    retrieval: z.object({
      candidateCount: z.number().int().min(1).max(100).default(20),
      resultCount: z.number().int().min(1).max(50).default(5),
      minimumScore: z.number().min(-1).max(1).default(0.15),
    }),
    reranking: z.object({
      enabled: z.boolean().default(false),
      providerId: z.uuid().nullable().default(null),
      modelId: z.string().trim().max(255).default(""),
    }),
  })
  .superRefine((config, context) => {
    if (config.chunking.overlapCharacters >= config.chunking.maxCharacters) {
      context.addIssue({
        code: "custom",
        path: ["chunking", "overlapCharacters"],
        message: "Chunk overlap must be smaller than chunk size",
      });
    }
    if (config.reranking.enabled && !config.reranking.modelId) {
      context.addIssue({
        code: "custom",
        path: ["reranking", "modelId"],
        message: "A reranking model is required when reranking is enabled",
      });
    }
  });

export type RagConfig = z.infer<typeof ragConfigSchema>;

export const DEFAULT_RAG_CONFIG: RagConfig = ragConfigSchema.parse({
  embedding: {},
  chunking: {},
  retrieval: {},
  reranking: {},
});

export function parseRagConfig(value: unknown): RagConfig {
  const parsed = ragConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_RAG_CONFIG;
}

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
