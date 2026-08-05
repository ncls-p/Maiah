import { generateImage } from "ai";
import { and,eq,isNull } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import { createChatImageAttachment } from "@/modules/chat/attachments";
import { calculateImageUsageImpact,parseImageGenerationConfig } from "@/modules/provider/model-runtime-config";
import { getUsageImpactSetting } from "@/modules/provider/usage-impact-settings";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { aiModels,aiProviders,usageEvents } from "@/server/infrastructure/db/schema";
import type { ProviderRuntimeConfig } from "@/server/infrastructure/providers";
import { getAdapter } from "@/server/infrastructure/providers";

async function providerRuntimeConfig(provider: typeof aiProviders.$inferSelect): Promise<ProviderRuntimeConfig> {
  const apiKey = provider.encryptedApiKey ? await decryptValue(provider.encryptedApiKey) : undefined;
  const headers: Record<string, string> = {};
  for (const [key, encryptedValue] of Object.entries((provider.encryptedHeadersJson as Record<string, string> | null) ?? {})) {
    headers[key] = await decryptValue(encryptedValue);
  }
  return {
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl ?? undefined,
    authType: provider.authType,
    apiKey,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    queryParams: (provider.queryParamsJson as Record<string, string> | null) ?? undefined,
    openaiCompatibleApiRoute: provider.openaiCompatibleApiRoute as "responses" | "chat-completions",
  };
}

export async function generateWorkspaceImage(input: { workspaceId: string; userId: string; conversationId?: string; prompt: string; size?: string }) {
  const rows = await db
    .select({ model: aiModels, provider: aiProviders })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
    .where(and(eq(aiProviders.workspaceId, input.workspaceId), eq(aiProviders.enabled, true), eq(aiModels.enabled, true), isNull(aiProviders.archivedAt)));

  const candidates = rows
    .map((row) => ({
      ...row,
      config: parseImageGenerationConfig(row.model.imageGenerationConfigJson),
      capabilities: (row.model.capabilitiesJson as Record<string, boolean> | null) ?? {},
    }))
    .filter((row) => row.config.enabled || row.capabilities.imageGeneration === true)
    .sort((left, right) => Number(right.config.isDefault) - Number(left.config.isDefault));

  let selected: (typeof candidates)[number] | undefined;
  for (const candidate of candidates) {
    const permission = await authorization.checkPermission({ principalType: "user", principalId: input.userId }, "models.invoke", "model", candidate.model.id);
    if (permission.granted) {
      selected = candidate;
      break;
    }
  }
  if (!selected) {
    throw new Error("No image model is configured or accessible in this project. Ask an administrator to enable one.");
  }

  const adapter = getAdapter(selected.provider.kind);
  if (!adapter.createImageModel) {
    throw new Error("This AI connection does not support image generation.");
  }
  const requestedSize = input.size ?? selected.config.defaultSize;
  if (!selected.config.allowedSizes.includes(requestedSize)) {
    throw new Error(`Unsupported image size. Allowed sizes: ${selected.config.allowedSizes.join(", ")}.`);
  }

  const startedAt = Date.now();
  const result = await generateImage({
    model: adapter.createImageModel(await providerRuntimeConfig(selected.provider), selected.model.modelId),
    prompt: input.prompt,
    size: requestedSize as `${number}x${number}`,
    n: 1,
    abortSignal: AbortSignal.timeout(120_000),
  });
  const attachment = await createChatImageAttachment({
    workspaceId: input.workspaceId,
    userId: input.userId,
    fileName: `generated-${Date.now()}.png`,
    bytes: result.image.uint8Array,
  });
  const usageImpactSetting = await getUsageImpactSetting();
  const calculatedImpact = calculateImageUsageImpact(selected.model.imageGenerationConfigJson, usageImpactSetting.co2GramsPerKwh);
  const impact = usageImpactSetting.enabled
    ? calculatedImpact
    : {
        cost: null,
        currency: calculatedImpact.currency,
        energyKwh: null,
        co2Grams: null,
      };

  await db.insert(usageEvents).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    providerId: selected.provider.id,
    modelId: selected.model.id,
    conversationId: input.conversationId ?? null,
    operation: "image_generation",
    costUsd: impact.cost === null || impact.currency !== "USD" ? null : String(impact.cost),
    latencyMs: Date.now() - startedAt,
    status: "success",
    metadataJson: {
      size: requestedSize,
      currency: impact.currency,
      cost: calculatedImpact.cost,
      energyKwh: calculatedImpact.energyKwh,
      co2Grams: calculatedImpact.co2Grams,
    },
  });

  return {
    kind: "generated_image" as const,
    attachment,
    prompt: input.prompt,
    size: requestedSize,
    provider: selected.provider.name,
    model: selected.model.displayName ?? selected.model.modelId,
    impact,
  };
}
