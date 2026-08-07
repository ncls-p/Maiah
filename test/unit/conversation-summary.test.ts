import { describe, expect, it } from "vitest";

import { shouldSummarizeConversation } from "@/modules/chat/conversation-summary";

describe("conversation summary policy", () => {
  it("summarizes at the configured token threshold", () => {
    expect(shouldSummarizeConversation({ enabled: true, summaryThresholdTokens: 8_000 }, 7_999)).toBe(false);
    expect(shouldSummarizeConversation({ enabled: true, summaryThresholdTokens: 8_000 }, 8_000)).toBe(true);
  });

  it("stays disabled without explicit memory or usable token usage", () => {
    expect(shouldSummarizeConversation({ enabled: false, summaryThresholdTokens: 8_000 }, 10_000)).toBe(false);
    expect(shouldSummarizeConversation({ enabled: true }, undefined)).toBe(false);
  });

  it("enforces the supported minimum threshold", () => {
    expect(shouldSummarizeConversation({ enabled: true, summaryThresholdTokens: 10 }, 999)).toBe(false);
    expect(shouldSummarizeConversation({ enabled: true, summaryThresholdTokens: 10 }, 1_000)).toBe(true);
  });
});
