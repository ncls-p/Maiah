import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import {
  DEFAULT_MAX_INPUT_CHARACTERS,
  limitModelHistory,
  resolveMaxInputCharacters,
} from "@/modules/chat/conversation-context-policy";

describe("conversation context policy", () => {
  it("uses the safe message limit by default and honors assistant overrides", () => {
    expect(resolveMaxInputCharacters(null)).toBe(DEFAULT_MAX_INPUT_CHARACTERS);
    expect(resolveMaxInputCharacters({ maxInputCharacters: 64_000 })).toBe(
      64_000,
    );
    expect(resolveMaxInputCharacters({ maxInputCharacters: 999_999 })).toBe(
      200_000,
    );
  });

  it("keeps the newest messages inside the configured context budget", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "a".repeat(3_000) },
      { role: "assistant", content: "b".repeat(1_600) },
      { role: "user", content: "c".repeat(1_600) },
    ];

    expect(
      limitModelHistory({
        messages,
        contextWindowTokens: 2_000,
        reservedOutputTokens: 1_000,
        systemPrompt: "",
      }),
    ).toEqual(messages.slice(1));
  });

  it("preserves a leading conversation summary while trimming history", () => {
    const summary: ModelMessage = {
      role: "system",
      content: "Earlier decisions",
    };
    const recent: ModelMessage[] = [
      { role: "user", content: "a".repeat(3_000) },
      { role: "assistant", content: "b".repeat(1_600) },
      { role: "user", content: "latest" },
    ];

    const result = limitModelHistory({
      messages: [summary, ...recent],
      contextWindowTokens: 2_000,
      reservedOutputTokens: 1_000,
      systemPrompt: "",
    });

    expect(result[0]).toBe(summary);
    expect(result.at(-1)).toBe(recent.at(-1));
    expect(result).not.toContain(recent[0]);
  });
});
