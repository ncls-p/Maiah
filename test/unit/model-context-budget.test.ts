import { describe, expect, it } from "vitest";
import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { fitProviderOutputBudget } from "@/modules/agent/model-context-budget";
import { resolveAgentRuntimeLimits } from "@/modules/agent/runtime-policy";

const prompt: LanguageModelV4CallOptions["prompt"] = [
  {
    role: "user",
    content: [{ type: "text", text: "What is in the service catalog?" }],
  },
];

describe("model-aware output budgets", () => {
  it("counts inline text documents as context rather than binary attachments", () => {
    const result = fitProviderOutputBudget(
      {
        prompt: [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "text/plain",
                data: { type: "text", text: "x".repeat(90_000) },
              },
            ],
          },
        ],
        maxOutputTokens: 50_000,
      },
      { contextWindow: 60_000 },
    );
    expect(result.maxOutputTokens).toBeLessThan(30_000);
  });
  it("does not treat a file's base64 transport size as text tokens", () => {
    const result = fitProviderOutputBudget(
      {
        prompt: [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "image/png",
                data: { type: "data", data: "a".repeat(1_000_000) },
              },
            ],
          },
        ],
        maxOutputTokens: 16_384,
      },
      { contextWindow: 128_000 },
    );
    expect(result.maxOutputTokens).toBe(16_384);
  });
  it("does not confuse a million-token context with an advertised output limit", () => {
    expect(
      resolveAgentRuntimeLimits({
        maxOutputTokens: 0,
        providerContextWindow: 1_000_000,
      }).maxOutputTokens,
    ).toBe(16_384);
    expect(
      resolveAgentRuntimeLimits({
        maxOutputTokens: 0,
        providerMaxOutputTokens: 0,
      }).maxOutputTokens,
    ).toBe(16_384);
    expect(
      resolveAgentRuntimeLimits({
        maxOutputTokens: 0,
        providerMaxOutputTokens: 131_072,
      }).maxOutputTokens,
    ).toBe(131_072);
  });

  it("keeps large model windows and advertised output capacity usable", () => {
    const result = fitProviderOutputBudget(
      { prompt },
      { contextWindow: 1_000_000, maxOutputTokens: 131_072 },
    );
    expect(result.prompt).toBe(prompt);
    expect(result.maxOutputTokens).toBe(131_072);
  });

  it("budgets large resolved tool schemas, not just the short user question", () => {
    const params: LanguageModelV4CallOptions = {
      prompt,
      maxOutputTokens: 993_532,
      tools: [
        {
          type: "function",
          name: "catalog",
          description: "x".repeat(30_000),
          inputSchema: { type: "object" },
        },
      ],
    };
    const result = fitProviderOutputBudget(params, {
      contextWindow: 1_000_000,
    });
    expect(result.maxOutputTokens! + 6_469).toBeLessThan(1_000_000);
    expect(result.maxOutputTokens).toBeLessThan(
      fitProviderOutputBudget(
        { ...params, tools: [] },
        { contextWindow: 1_000_000 },
      ).maxOutputTokens!,
    );
    expect(params.maxOutputTokens).toBe(993_532);
    expect(result.tools).toBe(params.tools);
  });

  it("honors explicit smaller output ceilings and missing or invalid metadata", () => {
    expect(
      fitProviderOutputBudget(
        { prompt, maxOutputTokens: 200 },
        { maxOutputTokens: 100 },
      ).maxOutputTokens,
    ).toBe(100);
    expect(
      fitProviderOutputBudget(
        { prompt },
        { contextWindow: 0, maxOutputTokens: NaN },
      ).maxOutputTokens,
    ).toBe(16_384);
  });

  it("leaves more headroom as tool results grow on subsequent steps", () => {
    const short = fitProviderOutputBudget(
      { prompt, maxOutputTokens: 100_000 },
      { contextWindow: 100_000 },
    );
    const long = fitProviderOutputBudget(
      {
        prompt: [
          ...prompt,
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "1",
                toolName: "catalog",
                output: { type: "json", value: { result: "é".repeat(12_000) } },
              },
            ],
          },
        ],
        maxOutputTokens: 100_000,
      },
      { contextWindow: 100_000 },
    );
    expect(long.maxOutputTokens).toBeLessThan(short.maxOutputTokens! - 8_000);
  });
});
