import { encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { generateChatAutomationArtifacts } from "@/modules/chat/automation";
import { consumeSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import { calculateTokenUsageImpact, parseSustainabilityConfig } from "@/modules/provider/model-runtime-config";
import { getUsageImpactSetting } from "@/modules/provider/usage-impact-settings";
import { db } from "@/server/infrastructure/db";
import { aiModels, conversations, messageParts, messages, usageEvents } from "@/server/infrastructure/db/schema";
import type { LanguageModelUsage } from "ai";
import { eq } from "drizzle-orm";

import { accumulateTokenCount } from "./route.accumulate-token-count";
import type { ChatExecutionContext } from "./route.execution-context";
import type { StreamedPartWriter } from "./route.streamed-parts";

export async function completeStandardChat(input: {
  context: ChatExecutionContext;
  totalUsage: LanguageModelUsage;
  partWriter: StreamedPartWriter;
  postCompletionAutomationRef: { current: (() => Promise<void>) | null };
  startedAt: number;
  enqueueEvent: (event: Record<string, unknown>) => void;
}) {
  const { context, totalUsage, partWriter } = input;
  const { providerConfig, continuationClaim, conversation, content, shouldRegenerateConversationTitle, assistantMessage, agentId, version, agent, actorUserId, requestId } = context;
  const [usageModel, usageImpactSetting] = await Promise.all([
    providerConfig.modelRecordId
      ? db.select({ inputTokenCost: aiModels.inputTokenCost, outputTokenCost: aiModels.outputTokenCost, sustainabilityConfigJson: aiModels.sustainabilityConfigJson }).from(aiModels).where(eq(aiModels.id, providerConfig.modelRecordId)).limit(1).then((rows) => rows[0])
      : Promise.resolve(undefined),
    getUsageImpactSetting(),
  ]);
  const sustainability = parseSustainabilityConfig(usageModel?.sustainabilityConfigJson);
  const calculateImpact = (inputTokens: number, outputTokens: number) => calculateTokenUsageImpact({ inputTokens, outputTokens, inputCostPerMillion: usageModel?.inputTokenCost, outputCostPerMillion: usageModel?.outputTokenCost, sustainability, currency: sustainability.currency, co2GramsPerKwh: usageImpactSetting.co2GramsPerKwh });
  const eventUsageImpact = calculateImpact(totalUsage.inputTokens ?? 0, totalUsage.outputTokens ?? 0);
  const displayedUsageImpact = calculateImpact((continuationClaim?.message.tokenInput ?? 0) + (totalUsage.inputTokens ?? 0), (continuationClaim?.message.tokenOutput ?? 0) + (totalUsage.outputTokens ?? 0));
  const assistantText = partWriter.parts.flatMap((part) => (part.type === "text" && "content" in part ? [part.content] : [])).join("\n").trim();
  input.postCompletionAutomationRef.current = async () => {
    const shouldSkipSuggestions = consumeSkipNextChatSuggestions(conversation.id);
    const artifacts = assistantText ? await generateChatAutomationArtifacts({ userMessage: content, assistantText, fallbackTitle: conversation.title, generateSuggestions: !shouldSkipSuggestions }) : { title: conversation.title, suggestions: [] };
    const generatedTitle = shouldRegenerateConversationTitle ? artifacts.title : conversation.title;
    if (artifacts.suggestions.length > 0) await partWriter.appendSuggestions(artifacts.suggestions);
    if (shouldRegenerateConversationTitle && generatedTitle.trim() && generatedTitle.trim() !== conversation.title.trim()) await db.update(conversations).set({ title: generatedTitle, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
  };
  const completedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(messages).set({ status: "completed", tokenInput: accumulateTokenCount(continuationClaim?.message.tokenInput ?? null, totalUsage.inputTokens), tokenOutput: accumulateTokenCount(continuationClaim?.message.tokenOutput ?? null, totalUsage.outputTokens), completedAt }).where(eq(messages.id, assistantMessage.id));
    await tx.update(conversations).set({ agentId, agentVersionId: version.id, sidebarOrder: null, updatedAt: completedAt }).where(eq(conversations.id, conversation.id));
    await tx.insert(usageEvents).values({ workspaceId: agent.workspaceId, userId: actorUserId, providerId: providerConfig.providerId, modelId: providerConfig.modelRecordId, agentId, conversationId: conversation.id, operation: "chat", inputTokens: totalUsage.inputTokens || null, outputTokens: totalUsage.outputTokens || null, costUsd: eventUsageImpact.cost === null || eventUsageImpact.currency !== "USD" ? null : String(eventUsageImpact.cost), latencyMs: Date.now() - input.startedAt, status: "success", metadataJson: { currency: eventUsageImpact.currency, cost: eventUsageImpact.cost, energyKwh: eventUsageImpact.energyKwh, co2Grams: eventUsageImpact.co2Grams } });
    if (usageImpactSetting.enabled) await tx.insert(messageParts).values({ messageId: assistantMessage.id, type: "impact", contentEncrypted: await encryptValue(JSON.stringify(displayedUsageImpact)), metadataJson: displayedUsageImpact, sortOrder: partWriter.nextSortOrder });
  });
  logger.info("Chat stream completed", { requestId, agentId, agentVersionId: version.id, workspaceId: agent.workspaceId, userId: actorUserId, conversationId: conversation.id, assistantMessageId: assistantMessage.id, inputTokens: totalUsage.inputTokens, outputTokens: totalUsage.outputTokens, latencyMs: Date.now() - input.startedAt });
  if (usageImpactSetting.enabled) input.enqueueEvent({ type: "impact", impact: displayedUsageImpact });
  input.enqueueEvent({ type: "done" });
}
