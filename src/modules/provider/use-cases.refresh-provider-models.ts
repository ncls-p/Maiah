import { logger } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import { aiModels, aiProviders } from "@/server/infrastructure/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  ProviderModelRefreshResult,
  discoverModels,
  listModels,
} from "./use-cases.update-model";

export async function refreshProviderModels(
  providerId: string,
  workspaceId: string,
): Promise<ProviderModelRefreshResult> {
  try {
    const models = await discoverModels(providerId, workspaceId);
    const registeredModels = await listModels(providerId);
    const registeredModelIds = new Set(
      registeredModels.map((model) => model.modelId),
    );
    const modelsToSync = models.filter((model) =>
      registeredModelIds.has(model.modelId),
    );
    if (modelsToSync.length > 0) {
      await db
        .insert(aiModels)
        .values(
          modelsToSync.map((model) => ({
            providerId,
            modelId: model.modelId,
            displayName: model.displayName || model.modelId,
            capabilitiesJson: model.capabilities || null,
            contextWindow: model.contextWindow || null,
            maxOutputTokens: model.maxOutputTokens || null,
            inputTokenCost: model.inputTokenCost || null,
            outputTokenCost: model.outputTokenCost || null,
            imageGenerationConfigJson: model.imageGeneration || null,
            sustainabilityConfigJson: model.sustainability || null,
          })),
        )
        .onConflictDoUpdate({
          target: [aiModels.providerId, aiModels.modelId],
          set: {
            displayName: sql`COALESCE(${aiModels.displayName}, excluded.display_name)`,
            capabilitiesJson: sql`COALESCE(excluded.capabilities_json, '{}'::jsonb) || COALESCE(${aiModels.capabilitiesJson}, '{}'::jsonb)`,
            contextWindow: sql`excluded.context_window`,
            maxOutputTokens: sql`excluded.max_output_tokens`,
            inputTokenCost: sql`CASE WHEN COALESCE((${aiModels.sustainabilityConfigJson}->>'manualOverride')::boolean, false) THEN ${aiModels.inputTokenCost} ELSE COALESCE(excluded.input_token_cost, ${aiModels.inputTokenCost}) END`,
            outputTokenCost: sql`CASE WHEN COALESCE((${aiModels.sustainabilityConfigJson}->>'manualOverride')::boolean, false) THEN ${aiModels.outputTokenCost} ELSE COALESCE(excluded.output_token_cost, ${aiModels.outputTokenCost}) END`,
            imageGenerationConfigJson: sql`COALESCE(excluded.image_generation_config_json, '{}'::jsonb) || COALESCE(${aiModels.imageGenerationConfigJson}, '{}'::jsonb)`,
            sustainabilityConfigJson: sql`CASE WHEN COALESCE((${aiModels.sustainabilityConfigJson}->>'manualOverride')::boolean, false) THEN COALESCE(excluded.sustainability_config_json, '{}'::jsonb) || COALESCE(${aiModels.sustainabilityConfigJson}, '{}'::jsonb) ELSE COALESCE(${aiModels.sustainabilityConfigJson}, '{}'::jsonb) || COALESCE(excluded.sustainability_config_json, '{}'::jsonb) END`,
            updatedAt: new Date(),
          },
        });
    }
    await db
      .update(aiProviders)
      .set({
        healthStatus: "healthy",
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiProviders.id, providerId));
    return { status: "healthy", imported: modelsToSync.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unsupported = message.includes("discovery not supported");
    logger.warn("Automatic provider model loading failed", {
      providerId,
      error: message,
    });
    await db
      .update(aiProviders)
      .set({
        healthStatus: unsupported ? "manual" : "unhealthy",
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiProviders.id, providerId));
    return {
      status: unsupported ? "manual" : "unhealthy",
      imported: 0,
    };
  }
}

export async function refreshAllProviderModels() {
  const providers = await db
    .select({
      id: aiProviders.id,
      workspaceId: aiProviders.workspaceId,
    })
    .from(aiProviders)
    .where(and(eq(aiProviders.enabled, true), isNull(aiProviders.archivedAt)));

  const results: ProviderModelRefreshResult[] = [];
  const concurrency = 4;
  for (let index = 0; index < providers.length; index += concurrency) {
    results.push(
      ...(await Promise.all(
        providers
          .slice(index, index + concurrency)
          .map((provider) =>
            refreshProviderModels(provider.id, provider.workspaceId),
          ),
      )),
    );
  }

  return {
    totalProviders: providers.length,
    refreshedProviders: results.filter((result) => result.status === "healthy")
      .length,
    failedProviders: results.filter((result) => result.status !== "healthy")
      .length,
    importedModels: results.reduce(
      (total, result) => total + result.imported,
      0,
    ),
  };
}
