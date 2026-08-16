import { generateText, type LanguageModel, type ModelMessage } from "ai";

import { createRuntimeDeadline } from "@/modules/agent/runtime-policy";
import {
  DEFAULT_SUMMARY_MAX_TOKENS,
  DEFAULT_SUMMARY_THRESHOLD_TOKENS,
  type ConversationContextPolicy,
} from "@/modules/chat/conversation-context-policy";

export type ConversationSummaryPolicy = ConversationContextPolicy;

export function shouldSummarizeConversation(
  policy: ConversationSummaryPolicy | null,
  inputTokens: number | undefined,
) {
  if (!policy?.enabled || !Number.isFinite(inputTokens)) return false;
  const threshold = Math.max(
    1_000,
    Math.floor(
      policy.summaryThresholdTokens ?? DEFAULT_SUMMARY_THRESHOLD_TOKENS,
    ),
  );
  return (inputTokens ?? 0) >= threshold;
}

export async function generateConversationSummary(input: {
  model: LanguageModel;
  history: ModelMessage[];
  assistantText: string;
  maxOutputTokens?: number;
}) {
  const deadline = createRuntimeDeadline(30_000);
  const result = await generateText({
    model: input.model,
    system: [
      "Create a compact, factual memory of this conversation for the next assistant turn.",
      "Preserve the user's goals, decisions, constraints, names, identifiers, unresolved work, and important tool results.",
      "Do not add facts, instructions, commentary, or markdown headings. Return only the summary.",
    ].join(" "),
    messages: [
      ...input.history,
      { role: "assistant", content: input.assistantText },
    ],
    temperature: 0,
    maxOutputTokens: Math.max(
      128,
      Math.floor(input.maxOutputTokens ?? DEFAULT_SUMMARY_MAX_TOKENS),
    ),
    abortSignal: deadline.signal,
  });
  return result.text.trim();
}
