import { describe, expect, it, vi } from "vitest";
import {
  APICallError,
  type LanguageModelV4CallOptions,
  type LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { withGenerationCompatibility } from "@/modules/agent/generation-compatibility";

const rejection = (requested = 993_532, input = 6_469, statusCode = 400) =>
  new APICallError({
    message: `This model's maximum context length is 1000000 tokens. However, you requested ${requested} output tokens and your prompt contains at least ${input} input tokens, for a total of at least ${requested + input} tokens.`,
    url: "https://provider.test",
    requestBodyValues: {},
    statusCode,
  });
const response = {
  content: [{ type: "text" as const, text: "Catalog" }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: {
    inputTokens: { total: 6469, noCache: 6469, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 10, text: 10, reasoning: 0 },
  },
  warnings: [],
};

describe("bounded recovery from context rejection", () => {
  it("reduces only the rejected output reservation once, preserving prompt and tools", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(rejection())
      .mockResolvedValue(response);
    const persist = vi.fn();
    const model = withGenerationCompatibility(
      new MockLanguageModelV4({ doGenerate: call }),
      { excluded: [], persist },
    );
    const params: LanguageModelV4CallOptions = {
      prompt: [{ role: "user", content: [{ type: "text", text: "catalog" }] }],
      maxOutputTokens: 993_532,
    };
    await model.doGenerate(params);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0].maxOutputTokens + 6469).toBeLessThan(
      1_000_000,
    );
    expect(call.mock.calls[1][0].prompt).toBe(params.prompt);
    expect(persist).not.toHaveBeenCalled();
    expect(params.maxOutputTokens).toBe(993_532);
  });

  it.each([
    rejection(993_532, 6_469, 500),
    rejection(993_532, 1_000_000),
    new Error("network failure"),
  ])(
    "never retries ambiguous failures or an input that already fills the window",
    async (error) => {
      const call = vi.fn().mockRejectedValue(error);
      const model = withGenerationCompatibility(
        new MockLanguageModelV4({ doGenerate: call }),
        { excluded: [], persist: vi.fn() },
      );
      await expect(
        model.doGenerate({ prompt: [], maxOutputTokens: 993_532 }),
      ).rejects.toBe(error);
      expect(call).toHaveBeenCalledTimes(1);
    },
  );

  it("stops after one context retry", async () => {
    const call = vi.fn(async (p: LanguageModelV4CallOptions) => {
      throw rejection(p.maxOutputTokens, 20_000);
    });
    const model = withGenerationCompatibility(
      new MockLanguageModelV4({ doGenerate: call }),
      { excluded: [], persist: vi.fn() },
    );
    await expect(
      model.doGenerate({ prompt: [], maxOutputTokens: 993_532 }),
    ).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("recovers a rejected stream opening but never restarts an opened stream", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(rejection())
      .mockResolvedValue({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: "error", error: rejection() });
            controller.close();
          },
        }),
      });
    const model = withGenerationCompatibility(
      new MockLanguageModelV4({ doStream: call }),
      { excluded: [], persist: vi.fn() },
    );
    const result = await model.doStream({
      prompt: [],
      maxOutputTokens: 993_532,
    });
    const reader = result.stream.getReader();
    expect((await reader.read()).value?.type).toBe("error");
    expect((await reader.read()).done).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
