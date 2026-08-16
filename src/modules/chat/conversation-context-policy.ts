import type { ModelMessage } from "ai";

export const DEFAULT_MAX_INPUT_CHARACTERS = 32_000;
export const MAX_INPUT_CHARACTERS = 200_000;
export const DEFAULT_SUMMARY_THRESHOLD_TOKENS = 24_000;
export const DEFAULT_SUMMARY_MAX_TOKENS = 1_200;

export interface ConversationContextPolicy {
  enabled?: boolean;
  summaryThresholdTokens?: number;
  summaryMaxTokens?: number;
  contextWindowTokens?: number;
  maxMessages?: number;
  maxInputCharacters?: number;
}

export function resolveMaxInputCharacters(
  policy: ConversationContextPolicy | null | undefined,
) {
  const configured = policy?.maxInputCharacters;
  if (!Number.isFinite(configured)) return DEFAULT_MAX_INPUT_CHARACTERS;
  return Math.min(
    MAX_INPUT_CHARACTERS,
    Math.max(1, Math.floor(configured ?? DEFAULT_MAX_INPUT_CHARACTERS)),
  );
}

function contentCharacters(content: ModelMessage["content"]): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((total, part) => {
    if (typeof part !== "object" || part === null) return total;
    if ("text" in part && typeof part.text === "string") {
      return total + part.text.length;
    }
    // Images and other binary parts still consume provider context even when
    // their byte representation is not useful for a text token estimate.
    return total + 4_000;
  }, 0);
}

export function estimateModelMessageTokens(message: ModelMessage) {
  return Math.max(1, Math.ceil(contentCharacters(message.content) / 4) + 4);
}

export function limitModelHistory(input: {
  messages: ModelMessage[];
  contextWindowTokens?: number;
  reservedOutputTokens: number;
  systemPrompt: string;
}) {
  if (!Number.isFinite(input.contextWindowTokens)) return input.messages;
  const contextWindowTokens = Math.max(
    2_000,
    Math.floor(input.contextWindowTokens ?? 2_000),
  );
  const fixedTokens = Math.ceil(input.systemPrompt.length / 4) + 64;
  const availableTokens = Math.max(
    256,
    contextWindowTokens - Math.max(1, input.reservedOutputTokens) - fixedTokens,
  );
  const leadingSummary =
    input.messages[0]?.role === "system" ? input.messages[0] : null;
  const candidates = leadingSummary ? input.messages.slice(1) : input.messages;
  const selected: ModelMessage[] = [];
  let usedTokens = leadingSummary
    ? estimateModelMessageTokens(leadingSummary)
    : 0;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index];
    const messageTokens = estimateModelMessageTokens(message);
    if (selected.length > 0 && usedTokens + messageTokens > availableTokens) {
      break;
    }
    selected.unshift(message);
    usedTokens += messageTokens;
  }

  return leadingSummary ? [leadingSummary, ...selected] : selected;
}
