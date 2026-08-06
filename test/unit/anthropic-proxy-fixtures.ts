import type { LanguageModelUsage,TextStreamPart,ToolSet } from "ai";

import { anthropicMessagesRequestSchema } from "@/modules/anthropic-proxy/contracts";

export const anthropicUsageFixture: LanguageModelUsage = {
  inputTokens: 8,
  inputTokenDetails: {
    noCacheTokens: 6,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
  },
  outputTokens: 4,
  outputTokenDetails: { textTokens: 4, reasoningTokens: 0 },
  totalTokens: 12,
};

export const anthropicErrorCases = [
  [403, "permission_error"],
  [404, "not_found_error"],
  [413, "request_too_large"],
  [429, "rate_limit_error"],
  [500, "api_error"],
  [400, "invalid_request_error"],
] as const;

export function anthropicRequest(overrides: Record<string, unknown> = {}) {
  return anthropicMessagesRequestSchema.parse({
    model: "model-a",
    max_tokens: 256,
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  });
}

export async function* anthropicStreamParts(values: Array<TextStreamPart<ToolSet>>) {
  for (const value of values) yield value;
}
