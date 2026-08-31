import { describe, expect, it, vi } from "vitest";

import {
  createResponsesSseLineNormalizer,
  normalizeResponsesReasoningSseLine,
  openaiCompatibleAdapter,
} from "@/server/infrastructure/providers/openai-compatible-adapter";

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
});
