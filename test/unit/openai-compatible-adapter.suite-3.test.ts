import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeResponsesInputForCompatibleProvider,
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

  it("applies the llama.cpp profile before sending unsupported references", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createChatModel(
      {
        kind: "openai-compatible",
        name: "llama.cpp",
        baseUrl: "http://localhost:8081/v1",
        authType: "custom-header",
        openaiCompatibilityProfile: "llama.cpp",
      },
      "test-model",
    );

    await expect(
      model.doGenerate(referencedContinuationCall),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as { input: Array<{ type?: string }> };
    expect(requestBody.input).not.toContainEqual(
      expect.objectContaining({ type: "item_reference" }),
    );
  });

  it("normalizes assistant output text only in the compatibility fallback", () => {
    const body = JSON.stringify({
      model: "test-model",
      input: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: [{ type: "output_text", text: "Hello there." }],
        },
        {
          type: "function_call",
          call_id: "call_1",
          name: "calculator",
          arguments: '{"expression":"1+1"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "2",
        },
      ],
    });

    expect(
      JSON.parse(String(normalizeResponsesInputForCompatibleProvider(body))),
    ).toEqual({
      model: "test-model",
      input: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hello there." },
        {
          type: "function_call",
          call_id: "call_1",
          name: "calculator",
          arguments: '{"expression":"1+1"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "2",
        },
      ],
    });
  });

  it("retries validation errors without unsupported item references", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            detail: [
              {
                type: "string_type",
                loc: ["body", "input", "str"],
                msg: "Input should be a valid string",
              },
            ],
          },
          { status: 422 },
        ),
      )
      .mockResolvedValueOnce(apiErrorResponse());
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as { input: Array<{ type?: string }> };
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    ) as { input: Array<{ type?: string }> };
    expect(firstBody.input).toContainEqual({
      type: "item_reference",
      id: "msg_previous_response",
    });
    expect(secondBody.input).not.toContainEqual(
      expect.objectContaining({ type: "item_reference" }),
    );
  });
});
