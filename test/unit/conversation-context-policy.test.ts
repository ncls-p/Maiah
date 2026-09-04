import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import {
  CONTEXT_SAFETY_MARGIN_TOKENS,
  DEFAULT_MAX_INPUT_CHARACTERS,
  MAX_GENERATION_OUTPUT_TOKENS,
  fitModelHistoryToContext,
  limitModelHistory,
  resolveContextWindowTokens,
  resolveMaxInputCharacters,
} from "@/modules/chat/conversation-context-policy";

describe("conversation context policy", () => {
  it("uses the full provider context for zero or an empty override", () => {
    expect(resolveContextWindowTokens(0, 131_072)).toBe(131_072);
    expect(resolveContextWindowTokens(undefined, 131_072)).toBe(131_072);
    expect(resolveContextWindowTokens(200_000, 131_072)).toBe(131_072);
    expect(resolveContextWindowTokens(64_000, 131_072)).toBe(64_000);
  });

  it("uses the safe message limit by default and honors assistant overrides", () => {
    expect(resolveMaxInputCharacters(null)).toBe(DEFAULT_MAX_INPUT_CHARACTERS);
    expect(resolveMaxInputCharacters({ maxInputCharacters: 64_000 })).toBe(
      64_000,
    );
    expect(resolveMaxInputCharacters({ maxInputCharacters: 999_999 })).toBe(
      200_000,
    );
  });

  it("keeps the newest messages inside the context budget and safety margin", () => {
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
    ).toEqual(messages.slice(2));
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

  it("caps oversized output requests while keeping a short conversation", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Is Prime Agent the best harness?" },
      { role: "assistant", content: "It depends on the workload." },
      { role: "user", content: "Compare it with Pi and OMP." },
      { role: "assistant", content: "Here is the comparison." },
      { role: "user", content: "Summarize our conversation." },
    ];

    const result = fitModelHistoryToContext({
      messages,
      contextWindowTokens: 122_880,
      requestedOutputTokens: 131_072,
      systemPrompt: "You are a coding assistant.",
    });

    expect(result.messages).toEqual(messages);
    expect(result.maxOutputTokens).toBe(MAX_GENERATION_OUTPUT_TOKENS);
  });

  it("keeps a safety margin between estimated input and output", () => {
    const result = fitModelHistoryToContext({
      messages: [{ role: "user", content: "a".repeat(400) }],
      contextWindowTokens: 10_000,
      requestedOutputTokens: MAX_GENERATION_OUTPUT_TOKENS,
      systemPrompt: "",
    });

    expect(result.maxOutputTokens).toBe(
      10_000 - 64 - 104 - CONTEXT_SAFETY_MARGIN_TOKENS,
    );
  });

  it.each([250_000, 1_000_000])(
    "keeps oversized requests safely below a %i-token context window",
    (contextWindowTokens) => {
      const result = fitModelHistoryToContext({
        messages: [{ role: "user", content: "a".repeat(26_156) }],
        contextWindowTokens,
        requestedOutputTokens: contextWindowTokens,
        systemPrompt: "",
      });

      expect(result.maxOutputTokens).toBe(MAX_GENERATION_OUTPUT_TOKENS);
      expect(result.maxOutputTokens + 6_608).toBeLessThan(contextWindowTokens);
    },
  );

  it("honors a model output limit below the application cap", () => {
    const result = fitModelHistoryToContext({
      messages: [],
      modelMaxOutputTokens: 4_096,
      requestedOutputTokens: MAX_GENERATION_OUTPUT_TOKENS,
      systemPrompt: "",
    });

    expect(result.maxOutputTokens).toBe(4_096);
  });
});
