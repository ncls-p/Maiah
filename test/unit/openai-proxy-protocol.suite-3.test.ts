import type { LanguageModelUsage } from "ai";
import { describe,expect,it } from "vitest";

import { chatCompletionRequestSchema,responsesRequestSchema } from "@/modules/openai-proxy/contracts";
import { invalidRequest,openAIErrorBody,providerError,validationError } from "@/modules/openai-proxy/errors";
import { buildChatCompletionResponse,buildResponsesResponse,chatFinishReason,chatUsage,responseCompletionState,responsesUsage,responseTextConfig } from "@/modules/openai-proxy/response-builders";

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

    expect(providerError({ statusCode: 429, message: "slow down" })).toMatchObject({
      status: 429,
      code: "upstream_rate_limit",
    });
    expect(providerError({ status: 404, message: "missing" })).toMatchObject({
      status: 404,
      code: "upstream_request_error",
    });
    expect(providerError({ status: 500, message: "private detail" })).toMatchObject({
      status: 502,
      code: "upstream_error",
    });
    expect(providerError({})).toMatchObject({
      status: 502,
      message: "The upstream model provider could not complete the request.",
    });
  });

  it("maps finish reasons, token details and structured response formats", () => {
    expect(["stop", "length", "content-filter", "tool-calls", "other"].map((reason) => chatFinishReason(reason as Parameters<typeof chatFinishReason>[0]))).toEqual(["stop", "length", "content_filter", "tool_calls", "stop"]);
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
        toolCalls: [{ toolCallId: "call_1", toolName: "lookup", input: { id: 1 } }],
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
        toolCalls: [{ toolCallId: "call_2", toolName: "lookup", input: undefined }],
        finishReason: "length",
        usage,
      },
    });
    expect(response.id).toMatch(/^resp_/);
    expect(response.status).toBe("incomplete");
    expect(response.incomplete_details).toEqual({
      reason: "max_output_tokens",
    });
    expect(response.output.map((item) => item.type)).toEqual(["message", "function_call"]);
  });
});
