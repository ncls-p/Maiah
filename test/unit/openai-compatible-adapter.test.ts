import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openaiCompatibleAdapter,
  stripUnsupportedResponsesItemReferences,
} from "@/server/infrastructure/providers/openai-compatible-adapter";

const generationCall = {
  prompt: [
    {
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    },
  ],
} as never;

function apiErrorResponse() {
  return new Response(
    JSON.stringify({
      error: {
        message: "Stop after capturing the request",
        type: "invalid_request_error",
      },
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    },
  );
}

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

describe("openaiCompatibleAdapter.createChatModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Responses API by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "Responses provider",
        baseUrl: "http://localhost:8081/v1",
        authType: "bearer",
        apiKey: "sk-test",
        queryParams: { tenant: "deodis" },
      },
      "test-model",
    );

    await expect(model.doGenerate(generationCall)).rejects.toThrow();

    const [input, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(input)).toBe(
      "http://localhost:8081/v1/responses?tenant=deodis",
    );
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer sk-test",
    );
    const requestBody = JSON.parse(String(init.body)) as Record<
      string,
      unknown
    >;
    expect(requestBody).toMatchObject({ model: "test-model" });
    expect(requestBody).toHaveProperty("input");
    expect(requestBody).not.toHaveProperty("messages");
  });

  it("removes only unsupported reasoning item references from a Responses continuation", () => {
    const body = JSON.stringify({
      model: "test-model",
      input: [
        { role: "user", content: "Create a project" },
        { type: "item_reference", id: "rs_1" },
        {
          type: "function_call",
          call_id: "call_1",
          name: "create_project",
          arguments: '{"name":"Demo"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: '{"ok":true}',
        },
      ],
    });

    expect(
      JSON.parse(String(stripUnsupportedResponsesItemReferences(body))),
    ).toEqual({
      model: "test-model",
      input: [
        { role: "user", content: "Create a project" },
        {
          type: "function_call",
          call_id: "call_1",
          name: "create_project",
          arguments: '{"name":"Demo"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: '{"ok":true}',
        },
      ],
    });
  });

  it("preserves the exact API base URL prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "Custom API prefix",
        baseUrl: "https://gateway.example.com/openai/",
        authType: "bearer",
        apiKey: "sk-test",
        openaiCompatibleApiRoute: "responses",
      },
      "test-model",
    );

    await expect(model.doGenerate(generationCall)).rejects.toThrow();

    const [input] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(input)).toBe("https://gateway.example.com/openai/responses");
  });

  it("uses Chat Completions when explicitly selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "Legacy provider",
        baseUrl: "http://localhost:8081/v1",
        authType: "custom-header",
        headers: { "X-Team": "ai-platform" },
        queryParams: { tenant: "deodis" },
        openaiCompatibleApiRoute: "chat-completions",
      },
      "test-model",
    );

    await expect(model.doGenerate(generationCall)).rejects.toThrow();

    const [input, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(input)).toBe(
      "http://localhost:8081/v1/chat/completions?tenant=deodis",
    );
    const requestBody = JSON.parse(String(init.body)) as Record<
      string,
      unknown
    >;
    expect(requestBody).toMatchObject({ model: "test-model" });
    expect(requestBody).toHaveProperty("messages");
    expect(requestBody).not.toHaveProperty("input");
  });

  it("does not leak the Responses API placeholder bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "Header provider",
        baseUrl: "http://localhost:8081/v1",
        authType: "x-api-key",
        apiKey: "secret-key",
      },
      "test-model",
    );

    await expect(model.doGenerate(generationCall)).rejects.toThrow();

    const [, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-api-key")).toBe("secret-key");
  });

  it("preserves an explicit custom Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "Custom auth provider",
        baseUrl: "http://localhost:8081/v1",
        authType: "custom-header",
        headers: { Authorization: "Token custom-secret" },
      },
      "test-model",
    );

    await expect(model.doGenerate(generationCall)).rejects.toThrow();

    const [, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Token custom-secret",
    );
  });
});

describe("openaiCompatibleAdapter.createImageModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the standard OpenAI-compatible image generation endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createImageModel?.(
      {
        kind: "openai-compatible",
        name: "Cloud Temple",
        baseUrl: "https://api.ai.cloud-temple.com/v1",
        authType: "bearer",
        apiKey: "secret-key",
      },
      "z-image:16b",
    );

    expect(model).toBeDefined();
    await expect(
      model!.doGenerate({
        prompt: "A mountain lake",
        n: 1,
        size: "1024x1024",
        providerOptions: {},
      } as never),
    ).rejects.toThrow();

    const [input, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(input)).toBe(
      "https://api.ai.cloud-temple.com/v1/images/generations",
    );
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer secret-key",
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "z-image:16b",
      prompt: "A mountain lake",
      size: "1024x1024",
    });
  });
});
