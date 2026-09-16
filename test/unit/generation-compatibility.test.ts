import { describe, expect, it, vi } from "vitest";
import {
  APICallError,
  type LanguageModelV4CallOptions,
  type LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { withGenerationCompatibility } from "@/modules/agent/generation-compatibility";
import {
  generationCallSettings,
  generationSettingsSchema,
  mergeProviderOptions,
} from "@/modules/agent/generation-settings";
const params: LanguageModelV4CallOptions = {
  prompt: [],
  temperature: 0.7,
  topP: 1,
  seed: 0,
};
const rejected = (param: string, statusCode = 400) =>
  new APICallError({
    message: `Unsupported parameter: '${param}' is not supported with this model.`,
    url: "https://provider.test",
    requestBodyValues: {},
    statusCode,
    responseBody: JSON.stringify({
      error: {
        param,
        message: `Unsupported parameter: '${param}' is not supported with this model.`,
      },
    }),
  });
const response = {
  content: [{ type: "text" as const, text: "ok" }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
  warnings: [],
};
describe("persistent generation compatibility boundary", () => {
  it("removes only rejected fields, retries per provider call and retains them for later calls", async () => {
    const call = vi.fn(async (p: LanguageModelV4CallOptions) => {
      if (p.temperature !== undefined) throw rejected("temperature");
      if (p.topP !== undefined) throw rejected("top_p");
      return response;
    });
    const persist = vi.fn();
    const model = withGenerationCompatibility(
      new MockLanguageModelV4({ doGenerate: call }),
      { excluded: [], persist },
    );
    await model.doGenerate(params);
    await model.doGenerate(params);
    expect(call).toHaveBeenCalledTimes(4);
    expect(call.mock.calls[3][0]).toEqual({ prompt: [], seed: 0 });
    expect(persist.mock.calls).toEqual([["temperature"], ["topP"]]);
    expect(params.temperature).toBe(0.7);
  });
  it("applies persisted corrections after a new model instance", async () => {
    const call = vi.fn(async () => response);
    const model = withGenerationCompatibility(
      new MockLanguageModelV4({ doGenerate: call }),
      { excluded: ["temperature"], persist: vi.fn() },
    );
    await model.doGenerate(params);
    expect(call).toHaveBeenCalledWith({ prompt: [], topP: 1, seed: 0 });
  });
  it.each([
    rejected("temperature", 500),
    rejected("temperature", 403),
    rejected("tools"),
    new Error("network failure"),
  ])("does not retry unrelated or ambiguous errors", async (error) => {
    const call = vi.fn().mockRejectedValue(error);
    const persist = vi.fn();
    const model = withGenerationCompatibility(
      new MockLanguageModelV4({ doGenerate: call }),
      { excluded: [], persist },
    );
    await expect(model.doGenerate(params)).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
  });
  it("retries a rejected stream opening but never replays errors within an opened stream", async () => {
    const call = vi.fn(async (p: LanguageModelV4CallOptions) => {
      if (p.temperature !== undefined) throw rejected("temperature");
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(c) {
            c.enqueue({ type: "text-start", id: "t" });
            c.enqueue({ type: "text-delta", id: "t", delta: "partial" });
            c.enqueue({ type: "error", error: rejected("top_p") });
            c.close();
          },
        }),
      };
    });
    const persist = vi.fn();
    const model = withGenerationCompatibility(
      new MockLanguageModelV4({ doStream: call }),
      { excluded: [], persist },
    );
    const result = await model.doStream(params);
    const reader = result.stream.getReader();
    const chunks = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
    }
    expect(chunks.at(-1)?.type).toBe("error");
    expect(call).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls).toEqual([["temperature"]]);
  });
  it("records SDK unsupported-setting warnings without a second model request", async () => {
    const persist = vi.fn();
    const call = vi.fn(async () => ({
      ...response,
      warnings: [{ type: "unsupported" as const, feature: "temperature" }],
    }));
    const model = withGenerationCompatibility(
      new MockLanguageModelV4({ doGenerate: call }),
      { excluded: [], persist },
    );
    await model.doGenerate(params);
    expect(call).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("temperature");
  });
  it("preserves zero values, validates bounds and merges provider options with explicit chat reasoning", () => {
    const generation = generationCallSettings({
      temperature: "0",
      topP: "",
      generationSettingsJson: {
        topK: 40,
        presencePenalty: 0,
        frequencyPenalty: -1,
        seed: 0,
        maxRetries: 0,
        stopSequences: ["END"],
        providerOptions: { openai: { textVerbosity: "low" } },
      },
    });
    expect(generation).toMatchObject({
      temperature: 0,
      topP: undefined,
      seed: 0,
      topK: 40,
      presencePenalty: 0,
      frequencyPenalty: -1,
      maxRetries: 0,
      stopSequences: ["END"],
    });
    expect(
      mergeProviderOptions(generation.providerOptions, {
        openai: { reasoningEffort: "high" },
      }),
    ).toEqual({ openai: { textVerbosity: "low", reasoningEffort: "high" } });
    expect(generationSettingsSchema.safeParse({ topK: -1 }).success).toBe(
      false,
    );
    expect(
      generationSettingsSchema.safeParse({
        providerOptions: { openai: "invalid" },
      }).success,
    ).toBe(false);
  });
});
