import { streamText } from "ai";
import { describe, expect, it, vi } from "vitest";

import { openaiCompatibleAdapter } from "@/server/infrastructure/providers/openai-compatible-adapter";

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

describe("openaiCompatibleAdapter.createChatModel", () => {
  it("synthesizes missing reasoning and text starts for malformed streams", async () => {
    const events = [
      {
        type: "response.created",
        response: { id: "resp_1", status: "in_progress" },
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

    const result = streamText({
      model,
      messages: [{ role: "user", content: "Hello" }],
    });
    const chunks: Array<{ type: string }> = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
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
