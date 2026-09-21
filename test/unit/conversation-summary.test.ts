import { describe, expect, it } from "vitest";

import { shouldSummarizeConversation } from "@/modules/chat/conversation-summary";

describe("conversation summary policy", () => {
  it("uses most of a large context automatically instead of compacting at 24k", () => {
    expect(
      shouldSummarizeConversation(
        { enabled: true, summaryThresholdTokens: 0 },
        24_000,
        1_000_000,
      ),
    ).toBe(false);
    expect(
      shouldSummarizeConversation({ enabled: true }, 849_999, 1_000_000),
    ).toBe(false);
    expect(
      shouldSummarizeConversation({ enabled: true }, 850_000, 1_000_000),
    ).toBe(true);
    expect(shouldSummarizeConversation({ enabled: true }, 4096, 8192)).toBe(
      true,
    );
    expect(
      shouldSummarizeConversation(
        { enabled: true, summaryThresholdTokens: 8000 },
        8000,
        1_000_000,
      ),
    ).toBe(true);
  });
  it("summarizes at the configured token threshold", () => {
    expect(
      shouldSummarizeConversation(
        { enabled: true, summaryThresholdTokens: 8_000 },
        7_999,
      ),
    ).toBe(false);
    expect(
      shouldSummarizeConversation(
        { enabled: true, summaryThresholdTokens: 8_000 },
        8_000,
      ),
    ).toBe(true);
  });

  it("stays disabled without explicit memory or usable token usage", () => {
    expect(
      shouldSummarizeConversation(
        { enabled: false, summaryThresholdTokens: 8_000 },
        10_000,
      ),
    ).toBe(false);
    expect(shouldSummarizeConversation({ enabled: true }, undefined)).toBe(
      false,
    );
  });

  it("honors thresholds below the former arbitrary minimum", () => {
    expect(
      shouldSummarizeConversation(
        { enabled: true, summaryThresholdTokens: 10 },
        9,
      ),
    ).toBe(false);
    expect(
      shouldSummarizeConversation(
        { enabled: true, summaryThresholdTokens: 10 },
        10,
      ),
    ).toBe(true);
  });
});
