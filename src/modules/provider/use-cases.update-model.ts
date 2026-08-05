import { logHandledError } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import { aiModels,aiProviders } from "@/server/infrastructure/db/schema";
import type { ModelDescriptor,ProviderRuntimeConfig } from "@/server/infrastructure/providers";
import { getAdapter } from "@/server/infrastructure/providers";
import { and,eq,sql } from "drizzle-orm";
import { MODEL_UPDATE_RULES,UpdateModelInput } from "./use-cases.test-provider-connection";
import { listProviders } from "./use-cases.update-provider";
import { buildProviderRuntimeConfig } from "./provider-runtime-config";

function buildModelUpdates(input: UpdateModelInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  for (const rule of MODEL_UPDATE_RULES) {
    const value = input[rule.key];
    if (value !== undefined) {
      updates[rule.column] = rule.normalize ? rule.normalize(value) : value;
    }
  }

  return updates;
}

export async function updateModel(modelId: string, input: UpdateModelInput) {
  try {
    await db.update(aiModels).set(buildModelUpdates(input)).where(eq(aiModels.id, modelId));
  } catch (error) {
    logHandledError("Failed to update model", { modelId }, error as Error);
    throw error;
  }
}

export async function deleteModel(modelId: string) {
  await db.delete(aiModels).where(eq(aiModels.id, modelId));
}

export async function listModels(providerId: string) {
  return db
    .select()
    .from(aiModels)
    .where(eq(aiModels.providerId, providerId))
    .orderBy(sql`${aiModels.createdAt} DESC`);
}

export async function getModelById(modelId: string) {
  const [model] = await db.select().from(aiModels).where(eq(aiModels.id, modelId)).limit(1);

  return model || null;
}

// ─── Discover models from provider ─────────────────────────────────────

export async function discoverModels(providerId: string, workspaceId: string): Promise<ModelDescriptor[]> {
  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, providerId), eq(aiProviders.workspaceId, workspaceId)))
    .limit(1);

  if (!provider) {
    throw new Error("Provider not found");
  }

  const adapter = getAdapter(provider.kind);
  if (!adapter.listModels) {
    throw new Error(`Model discovery not supported for kind: ${provider.kind}`);
  }

  const models = await adapter.listModels(await buildProviderRuntimeConfig(provider));
  return models;
}

export type DiscoveredProviderModels = {
  provider: {
    id: string;
    name: string;
    kind: ProviderRuntimeConfig["kind"];
  };
  models: ModelDescriptor[];
  error: string | null;
};

/**
 * Reads the live model catalog exposed by every enabled provider. OpenAI-
 * compatible adapters implement this through GET /models; one unavailable
 * provider must not prevent the other catalogs from being used.
 */
export async function discoverWorkspaceModels(workspaceId: string): Promise<DiscoveredProviderModels[]> {
  const providers = (await listProviders(workspaceId)).filter((provider) => provider.enabled);

  return Promise.all(
    providers.map(async (provider) => {
      try {
        return {
          provider: {
            id: provider.id,
            name: provider.name,
            kind: provider.kind,
          },
          models: await discoverModels(provider.id, workspaceId),
          error: null,
        };
      } catch (error) {
        return {
          provider: {
            id: provider.id,
            name: provider.name,
            kind: provider.kind,
          },
          models: [],
          error: error instanceof Error ? error.message : "Model discovery failed",
        };
      }
    }),
  );
}

export type ProviderModelRefreshResult = {
  status: "healthy" | "unhealthy" | "manual";
  imported: number;
};
