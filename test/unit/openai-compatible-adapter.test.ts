import { afterEach,describe,expect,it,vi } from "vitest";

import {
openaiCompatibleAdapter
} from "@/server/infrastructure/providers/openai-compatible-adapter";

describe("openaiCompatibleAdapter.listModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes vLLM-served chat models from OpenAI-compatible /models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            id: "nvidia/Qwen3.6-27B-NVFP4",
            object: "model",
            owned_by: "vllm",
            backend: "vllm",
          },
          {
            id: "RedHatAI/gemma-4-31B-it-NVFP4",
            object: "model",
            owned_by: "vllm",
            backend: "vllm",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const models = await openaiCompatibleAdapter.listModels?.({
      kind: "openai-compatible",
      name: "Cortex",
      baseUrl: "http://localhost:8081/v1",
      authType: "custom-header",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8081/v1/models",
      expect.any(Object),
    );
    expect(models?.map((model) => model.modelId)).toEqual([
      "nvidia/Qwen3.6-27B-NVFP4",
      "RedHatAI/gemma-4-31B-it-NVFP4",
    ]);
  });

  it("preserves the exact API prefix when listing models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await openaiCompatibleAdapter.listModels?.({
      kind: "openai-compatible",
      name: "Custom API prefix",
      baseUrl: "https://gateway.example.com/openai/",
      authType: "bearer",
      apiKey: "sk-test",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.com/openai/models",
      expect.any(Object),
    );
  });

  it("keeps every model with an id, including embedding models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: [
            { id: "chat-model", backend: "vllm" },
            { id: "embedding-model", backend: "vllm", task: "embedding" },
            { object: "model", backend: "vllm" },
          ],
        }),
      ),
    );

    const models = await openaiCompatibleAdapter.listModels?.({
      kind: "openai-compatible",
      name: "Cortex",
      baseUrl: "http://localhost:8081/v1",
      authType: "custom-header",
    });

    expect(models?.map((model) => model.modelId)).toEqual([
      "chat-model",
      "embedding-model",
    ]);
  });

  it("prefers explicit API pricing and sustainability metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: [
            {
              id: "measured-model",
              max_model_len: 120_000,
              pricing: {
                input_per_million: "2.5",
                output_per_million: 9,
                currency: "USD",
              },
              sustainability: {
                energy_kwh_per_million_tokens: "1.25",
                co2_grams_per_million_tokens: 42,
              },
            },
          ],
        }),
      ),
    );

    const models = await openaiCompatibleAdapter.listModels?.({
      kind: "openai-compatible",
      name: "Measured API",
      baseUrl: "https://models.example.com/v1",
      authType: "bearer",
      apiKey: "secret",
    });

    expect(models?.[0]).toMatchObject({
      contextWindow: 120_000,
      inputTokenCost: "2.5",
      outputTokenCost: "9",
      sustainability: {
        energyKwhPerMillionTokens: 1.25,
        co2GramsPerMillionTokens: 42,
        currency: "USD",
        source: "Provider API model metadata",
      },
    });
  });
});
