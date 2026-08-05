import { describe,expect,it,vi } from "vitest";

import { normalizeResponsesReasoningSseLine,openaiCompatibleAdapter } from "@/server/infrastructure/providers/openai-compatible-adapter";

const generationCall = {
  prompt: [
    {
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    },
  ],
} as never;

const referencedContinuationCall = {
  prompt: [
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I inspected the project.",
          providerOptions: {
            openai: { itemId: "msg_previous_response" },
          },
        },
      ],
    },
    {
      role: "user",
      content: [{ type: "text", text: "Continue" }],
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

describe("openaiCompatibleAdapter.createChatModel", () => {
  it("keeps the OpenAI Responses payload unchanged for unrelated errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            message: "The model is temporarily unavailable",
            type: "server_error",
          },
        },
        { status: 500 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "Responses provider",
        baseUrl: "http://localhost:8081/v1",
        authType: "custom-header",
      },
      "test-model",
    );

    await expect(model.doGenerate(referencedContinuationCall)).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps preserved reasoning text events to the Responses summary protocol", () => {
    expect(normalizeResponsesReasoningSseLine("event: response.reasoning_text.delta")).toBe("event: response.reasoning_summary_text.delta");

    const normalizedLine = normalizeResponsesReasoningSseLine(
      `data: ${JSON.stringify({
        type: "response.reasoning_text.delta",
        item_id: "reasoning-1",
        content_index: 2,
        delta: "Inspect the request",
      })}`,
    );
    expect(JSON.parse(normalizedLine.slice("data: ".length))).toEqual({
      type: "response.reasoning_summary_text.delta",
      item_id: "reasoning-1",
      content_index: 2,
      summary_index: 2,
      delta: "Inspect the request",
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

    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(input)).toBe("http://localhost:8081/v1/chat/completions?tenant=deodis");
    const requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
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

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
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

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(new Headers(init.headers).get("authorization")).toBe("Token custom-secret");
  });
});
