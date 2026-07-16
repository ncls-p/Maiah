import { describe, expect, it, vi } from "vitest";
import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";

import {
  chatCompletionRequestSchema,
  responsesRequestSchema,
} from "@/modules/openai-proxy/contracts";
import {
  OpenAIProxyError,
  invalidRequest,
  openAIErrorBody,
  providerError,
  validationError,
} from "@/modules/openai-proxy/errors";
import {
  prepareChatCompletion,
  prepareResponsesRequest,
} from "@/modules/openai-proxy/request-mapper";
import {
  buildChatCompletionResponse,
  buildResponsesResponse,
  chatFinishReason,
  chatUsage,
  responseCompletionState,
  responsesUsage,
  responseTextConfig,
} from "@/modules/openai-proxy/response-builders";
import {
  createChatCompletionStream,
  createResponsesStream,
} from "@/modules/openai-proxy/streams";

const usage: LanguageModelUsage = {
  inputTokens: 6,
  inputTokenDetails: {
    noCacheTokens: 4,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
  },
  outputTokens: 3,
  outputTokenDetails: { textTokens: 2, reasoningTokens: 1 },
  totalTokens: 9,
};

function chat(body: Record<string, unknown>) {
  return chatCompletionRequestSchema.parse({
    model: "model-a",
    messages: [{ role: "user", content: "Hello" }],
    ...body,
  });
}

function responses(body: Record<string, unknown>) {
  return responsesRequestSchema.parse({
    model: "model-a",
    input: "Hello",
    ...body,
  });
}

async function* parts(
  values: Array<TextStreamPart<ToolSet>>,
): AsyncIterable<TextStreamPart<ToolSet>> {
  for (const value of values) yield value;
}

async function responseText(response: Response) {
  return await response.text();
}

describe("OpenAI proxy protocol mapping", () => {
  it("maps legacy functions and provider options", () => {
    const prepared = prepareChatCompletion(
      chat({
        messages: [
          { role: "system", content: [{ type: "text", text: "Rules" }] },
          { role: "user", content: "Find 42" },
          {
            role: "assistant",
            content: "",
            function_call: { name: "lookup", arguments: '{"id":42}' },
          },
          { role: "function", name: "lookup", content: "found" },
        ],
        functions: [
          {
            name: "lookup",
            parameters: { type: "object", properties: {} },
          },
        ],
        function_call: { name: "lookup" },
        max_tokens: 50,
        temperature: 0.2,
        top_p: 0.8,
        presence_penalty: 0.1,
        frequency_penalty: -0.1,
        seed: 7,
        stop: "END",
        parallel_tool_calls: false,
        reasoning_effort: "low",
        service_tier: "default",
        user: "caller-1",
      }),
    );

    expect(prepared.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(prepared.toolChoice).toEqual({ type: "tool", toolName: "lookup" });
    expect(prepared.maxOutputTokens).toBe(50);
    expect(prepared.stopSequences).toEqual(["END"]);
    expect(prepared.providerOptions).toMatchObject({
      parallelToolCalls: false,
      reasoningEffort: "low",
      serviceTier: "default",
      user: "caller-1",
    });
  });

  it("maps Responses multimodal input, files and function output", () => {
    const prepared = prepareResponsesRequest(
      responses({
        instructions: "Be concise",
        input: [
          { role: "developer", content: "Rules" },
          {
            role: "user",
            content: [
              { type: "input_text", text: "Inspect" },
              {
                type: "input_image",
                image_url: "data:image/png;base64,aGVsbG8=",
              },
              {
                type: "input_file",
                file_url: "https://example.test/report.pdf",
                filename: "report.pdf",
              },
              {
                type: "input_file",
                file_data: "data:text/plain;base64,aGVsbG8=",
                filename: "note.txt",
              },
            ],
          },
          { role: "assistant", content: "Calling" },
          {
            type: "function_call",
            call_id: "call_1",
            name: "lookup",
            arguments: "{}",
          },
          {
            type: "function_call_output",
            call_id: "call_1",
            output: { ok: true },
          },
        ],
        tools: [{ type: "function", name: "lookup" }],
        text: { format: { type: "json_object" } },
        parallel_tool_calls: false,
        reasoning: { effort: "medium" },
        safety_identifier: "safe-user",
        prompt_cache_key: "cache-1",
        truncation: "auto",
        user: "caller-2",
      }),
    );

    expect(prepared.messages.map((message) => message.role)).toEqual([
      "system",
      "system",
      "user",
      "assistant",
      "assistant",
      "tool",
    ]);
    expect(prepared.responseFormat).toEqual({ type: "json_object" });
    expect(prepared.providerOptions).toMatchObject({
      parallelToolCalls: false,
      reasoningEffort: "medium",
      safetyIdentifier: "safe-user",
      promptCacheKey: "cache-1",
      truncation: "auto",
      user: "caller-2",
    });
  });

  it("rejects malformed messages and tool round trips", () => {
    const cases = [
      () =>
        prepareChatCompletion(
          chat({ messages: [{ role: "system", content: {} }] }),
        ),
      () =>
        prepareChatCompletion(
          chat({ messages: [{ role: "user", content: {} }] }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            messages: [
              { role: "user", content: [{ type: "audio", data: "x" }] },
            ],
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: "not-a-url" } },
                ],
              },
            ],
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            messages: [{ role: "assistant", content: null, tool_calls: {} }],
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            messages: [
              {
                role: "assistant",
                tool_calls: [
                  {
                    id: "call_1",
                    function: { name: "lookup", arguments: "{" },
                  },
                ],
              },
            ],
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            messages: [{ role: "function", name: "lookup", content: "x" }],
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            messages: [{ role: "tool", tool_call_id: "missing", content: "x" }],
          }),
        ),
      () =>
        prepareResponsesRequest(
          responses({
            input: [
              { type: "function_call_output", call_id: "missing", output: "x" },
            ],
          }),
        ),
      () =>
        prepareResponsesRequest(responses({ input: [{ type: "unknown" }] })),
    ];

    for (const execute of cases) expect(execute).toThrow(OpenAIProxyError);
  });

  it("rejects invalid or conflicting function definitions", () => {
    const cases = [
      () =>
        prepareChatCompletion(
          chat({
            tools: [{ type: "function", function: { name: "bad name" } }],
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            tools: [
              {
                type: "function",
                function: { name: "lazy", defer_loading: true },
              },
            ],
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            tools: [
              { type: "function", function: { name: "same" } },
              { type: "function", function: { name: "same" } },
            ],
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            tools: [{ type: "function", function: { name: "known" } }],
            tool_choice: { type: "function", function: { name: "missing" } },
          }),
        ),
      () =>
        prepareChatCompletion(
          chat({
            tools: [{ type: "function", function: { name: "modern" } }],
            functions: [{ name: "legacy" }],
          }),
        ),
    ];

    for (const execute of cases) expect(execute).toThrow(OpenAIProxyError);
  });

  it("rejects every explicitly unsupported Chat parameter", () => {
    const cases = [
      chat({ n: 2 }),
      chat({ logprobs: true }),
      chat({ top_logprobs: 2 }),
      chat({ modalities: ["audio"] }),
      chat({ audio: { format: "wav" } }),
      chat({ store: true }),
      chat({ web_search_options: {} }),
      chat({ prediction: {} }),
      chat({ verbosity: "high" }),
    ];

    for (const request of cases) {
      expect(() => prepareChatCompletion(request)).toThrow(OpenAIProxyError);
    }
  });

  it("rejects every explicitly unsupported Responses parameter", () => {
    const cases = [
      responses({ previous_response_id: "resp_1" }),
      responses({ store: true }),
      responses({ background: true }),
      responses({ include: ["reasoning.encrypted_content"] }),
      responses({ reasoning: { summary: "auto" } }),
      responses({ prompt: {} }),
      responses({ conversation: "conv_1" }),
      responses({ context_management: [] }),
      responses({ max_tool_calls: 3 }),
      responses({ top_logprobs: 2 }),
    ];

    for (const request of cases) {
      expect(() => prepareResponsesRequest(request)).toThrow(OpenAIProxyError);
    }
  });
});

describe("OpenAI proxy errors and response objects", () => {
  it("normalizes validation and upstream errors into OpenAI envelopes", () => {
    const own = invalidRequest("Bad model", "model", "bad_model");
    expect(openAIErrorBody(own)).toEqual({
      error: {
        message: "Bad model",
        type: "invalid_request_error",
        param: "model",
        code: "bad_model",
      },
    });
    expect(providerError(own)).toBe(own);

    const invalid = chatCompletionRequestSchema.safeParse({
      model: "",
      messages: [],
    });
    if (invalid.success) throw new Error("Expected schema failure");
    expect(validationError(invalid.error)).toMatchObject({
      status: 400,
      type: "invalid_request_error",
    });

    expect(
      providerError({ statusCode: 429, message: "slow down" }),
    ).toMatchObject({
      status: 429,
      code: "upstream_rate_limit",
    });
    expect(providerError({ status: 404, message: "missing" })).toMatchObject({
      status: 404,
      code: "upstream_request_error",
    });
    expect(
      providerError({ status: 500, message: "private detail" }),
    ).toMatchObject({
      status: 502,
      code: "upstream_error",
    });
    expect(providerError({})).toMatchObject({
      status: 502,
      message: "The upstream model provider could not complete the request.",
    });
  });

  it("maps finish reasons, token details and structured response formats", () => {
    expect(
      ["stop", "length", "content-filter", "tool-calls", "other"].map(
        (reason) =>
          chatFinishReason(reason as Parameters<typeof chatFinishReason>[0]),
      ),
    ).toEqual(["stop", "length", "content_filter", "tool_calls", "stop"]);
    expect(chatUsage(usage)).toMatchObject({
      prompt_tokens: 6,
      completion_tokens: 3,
      total_tokens: 9,
      prompt_tokens_details: { cached_tokens: 2 },
      completion_tokens_details: { reasoning_tokens: 1 },
    });
    expect(responsesUsage(usage)).toMatchObject({
      input_tokens: 6,
      output_tokens: 3,
      total_tokens: 9,
    });
    expect(responseTextConfig({ type: "text" })).toEqual({
      format: { type: "text" },
    });
    expect(
      responseTextConfig({
        type: "json_schema",
        name: "answer",
        description: "Answer object",
        schema: { type: "object" },
        strict: true,
      }),
    ).toMatchObject({
      format: { type: "json_schema", name: "answer", strict: true },
    });
    expect(responseCompletionState("length")).toEqual({
      status: "incomplete",
      incompleteDetails: { reason: "max_output_tokens" },
    });
    expect(responseCompletionState("content-filter")).toEqual({
      status: "incomplete",
      incompleteDetails: { reason: "content_filter" },
    });
  });

  it("builds tool-call and incomplete response payloads", () => {
    const chatResponse = buildChatCompletionResponse({
      request: chat({}),
      result: {
        text: "",
        toolCalls: [
          { toolCallId: "call_1", toolName: "lookup", input: { id: 1 } },
        ],
        finishReason: "tool-calls",
        usage,
      },
    });
    expect(chatResponse.id).toMatch(/^chatcmpl-/);
    expect(chatResponse.choices[0].message).toMatchObject({
      content: null,
      tool_calls: [{ function: { name: "lookup", arguments: '{"id":1}' } }],
    });

    const response = buildResponsesResponse({
      request: responses({ max_output_tokens: 10, metadata: { trace: "1" } }),
      responseFormat: { type: "json_object" },
      result: {
        text: "partial",
        toolCalls: [
          { toolCallId: "call_2", toolName: "lookup", input: undefined },
        ],
        finishReason: "length",
        usage,
      },
    });
    expect(response.id).toMatch(/^resp_/);
    expect(response.status).toBe("incomplete");
    expect(response.incomplete_details).toEqual({
      reason: "max_output_tokens",
    });
    expect(response.output.map((item) => item.type)).toEqual([
      "message",
      "function_call",
    ]);
  });
});

describe("OpenAI proxy streaming edge cases", () => {
  it("streams Chat function calls and reports upstream failures", async () => {
    const complete = createChatCompletionStream({
      request: chat({ stream: true, stream_options: { include_usage: true } }),
      result: {
        stream: parts([
          { type: "start" },
          {
            type: "tool-input-start",
            id: "call_1",
            toolName: "lookup",
            providerExecuted: false,
          },
          { type: "tool-input-delta", id: "call_1", delta: '{"id":1}' },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "lookup",
            input: { id: 1 },
            providerExecuted: false,
            dynamic: true,
          },
          {
            type: "finish",
            finishReason: "tool-calls",
            rawFinishReason: "tool_calls",
            totalUsage: usage,
          },
        ]),
      },
      callbacks: { onComplete: vi.fn(), onError: vi.fn() },
    });
    const body = await responseText(complete);
    expect(body).toContain('"finish_reason":"tool_calls"');
    expect(body).toContain("data: [DONE]");

    const failed = createChatCompletionStream({
      request: chat({ stream: true }),
      result: { stream: parts([{ type: "error", error: new Error("boom") }]) },
      callbacks: { onComplete: vi.fn(), onError: vi.fn() },
    });
    expect(await responseText(failed)).toContain('"code":"upstream_error"');
  });

  it("streams Responses function calls and failure events", async () => {
    const complete = createResponsesStream({
      request: responses({ stream: true }),
      responseFormat: { type: "text" },
      result: {
        stream: parts([
          { type: "start" },
          {
            type: "tool-call",
            toolCallId: "call_2",
            toolName: "lookup",
            input: { id: 2 },
            providerExecuted: false,
            dynamic: true,
          },
          {
            type: "finish",
            finishReason: "tool-calls",
            rawFinishReason: "tool_calls",
            totalUsage: usage,
          },
        ]),
      },
      callbacks: { onComplete: vi.fn(), onError: vi.fn() },
    });
    const body = await responseText(complete);
    expect(body).toContain("response.function_call_arguments.done");
    expect(body).toContain("response.completed");

    const failed = createResponsesStream({
      request: responses({ stream: true }),
      responseFormat: { type: "text" },
      result: { stream: parts([{ type: "abort", reason: "cancelled" }]) },
      callbacks: { onComplete: vi.fn(), onError: vi.fn() },
    });
    expect(await responseText(failed)).toContain("response.failed");
  });
});
