import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createResponsesSseLineNormalizer,
  normalizeResponsesReasoningSseLine,
  openaiCompatibleAdapter,
} from "@/server/infrastructure/providers/openai-compatible-adapter";

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

    await expect(
      model.doGenerate(referencedContinuationCall),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries llama.cpp item type errors without unsupported item references", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message: "Cannot determine type of 'item'",
              type: "invalid_request_error",
            },
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "llama.cpp",
        baseUrl: "http://localhost:8081/v1",
        authType: "custom-header",
      },
      "test-model",
    );

    await expect(
      model.doGenerate(referencedContinuationCall),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    ) as { input: Array<{ type?: string }> };
    expect(fallbackBody.input).not.toContainEqual(
      expect.objectContaining({ type: "item_reference" }),
    );
  });

  it("maps preserved reasoning text events to the Responses summary protocol", () => {
    expect(
      normalizeResponsesReasoningSseLine(
        "event: response.reasoning_text.delta",
      ),
    ).toBe("event: response.reasoning_summary_text.delta");

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

  it("repairs missing Responses lifecycle fields for strict AI SDK clients", () => {
    const normalizeLine = createResponsesSseLineNormalizer("llama-model");
    const normalizePayload = (payload: Record<string, unknown>) =>
      JSON.parse(
        normalizeLine(`data: ${JSON.stringify(payload)}`).slice(
          "data: ".length,
        ),
      ) as Record<string, unknown>;

    const created = normalizePayload({
      type: "response.created",
      response: { id: "resp_1", status: "in_progress" },
    });
    expect(created.response).toMatchObject({
      id: "resp_1",
      model: "llama-model",
      created_at: expect.any(Number),
    });

    expect(
      normalizePayload({
        type: "response.output_item.added",
        item: {
          id: "rs_1",
          type: "reasoning",
          content: null,
          summary: null,
        },
      }),
    ).toMatchObject({
      output_index: 0,
      item: { id: "rs_1", content: [], summary: [] },
    });
    expect(
      normalizePayload({
        type: "response.output_item.added",
        item: { id: "msg_1", type: "message", content: [] },
      }),
    ).toMatchObject({ output_index: 1 });
    expect(
      normalizePayload({
        type: "response.output_text.delta",
        item_id: "msg_1",
        delta: "Hello",
      }),
    ).toMatchObject({ output_index: 1 });
    expect(
      normalizePayload({
        type: "response.output_item.added",
        item: {
          type: "function_call",
          call_id: "call_1",
          name: "search",
          arguments: "",
        },
      }),
    ).toMatchObject({
      output_index: 2,
      item: { id: "call_1" },
    });
    expect(
      normalizePayload({
        type: "response.function_call_arguments.delta",
        item_id: "call_1",
        delta: "{}",
      }),
    ).toMatchObject({ output_index: 2 });
    expect(
      normalizePayload({
        type: "response.output_item.done",
        item: {
          id: "call_1",
          type: "function_call",
          call_id: "call_1",
          name: "search",
          arguments: "{}",
        },
      }),
    ).toMatchObject({ output_index: 2 });
  });

  it("synthesizes missing reasoning and text starts for malformed streams", async () => {
    const events = [
      {
        type: "response.created",
        response: { id: "resp_1", status: "in_progress" },
      },
      {
        type: "response.output_item.added",
        item: {
          id: "rs_1",
          type: "reasoning",
          content: null,
          summary: null,
          encrypted_content: "",
          status: "in_progress",
        },
      },
      {
        type: "response.reasoning_text.delta",
        item_id: "rs_1",
        delta: "Inspect the request",
      },
      {
        type: "response.output_item.done",
        item: {
          id: "rs_1",
          type: "reasoning",
          content: [],
          summary: [],
          encrypted_content: "",
        },
      },
      {
        type: "response.output_text.delta",
        item_id: "msg_without_added_event",
        delta: "Hello",
      },
      {
        type: "response.output_item.done",
        item: {
          id: "msg_without_added_event",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [],
        },
      },
      {
        type: "response.completed",
        response: {
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ];
    const streamBody = events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join("");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(streamBody, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "llama.cpp",
        baseUrl: "http://localhost:8081/v1",
        authType: "custom-header",
        openaiCompatibleApiRoute: "responses",
      },
      "llama-model",
    );

    const result = await model.doStream(generationCall);
    const chunks: Array<{ type: string }> = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(chunks.map((chunk) => chunk.type)).toEqual(
      expect.arrayContaining([
        "reasoning-start",
        "reasoning-delta",
        "reasoning-end",
        "text-start",
        "text-delta",
        "text-end",
        "finish",
      ]),
    );
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
