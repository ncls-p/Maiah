import { afterEach, describe, expect, it, vi } from "vitest";

import { openaiCompatibleAdapter } from "@/server/infrastructure/providers/openai-compatible-adapter";

const multiTurnCall = {
  prompt: [
    {
      role: "user",
      content: [{ type: "text", text: "First question" }],
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "First answer" }],
    },
    {
      role: "user",
      content: [{ type: "text", text: "Second question" }],
    },
  ],
} as never;

function apiError(message: string) {
  return Response.json(
    { error: { message, type: "invalid_request_error" } },
    { status: 400 },
  );
}

function requestInput(fetchMock: ReturnType<typeof vi.fn>, callIndex: number) {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit;
  return (JSON.parse(String(init.body)) as { input: unknown[] }).input;
}

describe("llama.cpp Responses multi-turn compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replays persisted assistant text as explicit user context", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(apiError("Stop after capturing the request"));
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "llama.cpp",
        baseUrl: "http://localhost:8081/v1",
        authType: "custom-header",
        openaiCompatibleApiRoute: "responses",
        openaiCompatibilityProfile: "llama.cpp",
      },
      "muse-glimmer-30b",
    );

    await expect(model.doGenerate(multiTurnCall)).rejects.toThrow();

    expect(requestInput(fetchMock, 0)).toContainEqual({
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "First answer",
          annotations: [],
        },
      ],
      status: "completed",
      id: "msg_maiah_1",
    });
  });

  it("uses the same safe replay when auto compatibility retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiError("Cannot determine type of 'item'"))
      .mockResolvedValueOnce(apiError("Stop after capturing the fallback"));
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "Auto-compatible provider",
        baseUrl: "http://localhost:8081/v1",
        authType: "custom-header",
        openaiCompatibleApiRoute: "responses",
        openaiCompatibilityProfile: "auto",
      },
      "muse-glimmer-30b",
    );

    await expect(model.doGenerate(multiTurnCall)).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestInput(fetchMock, 1)).toContainEqual({
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "First answer",
          annotations: [],
        },
      ],
      status: "completed",
      id: "msg_maiah_1",
    });
  });
});
