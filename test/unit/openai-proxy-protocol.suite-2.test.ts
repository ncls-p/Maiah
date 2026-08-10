import { describe, expect, it } from "vitest";

import {
  chatCompletionRequestSchema,
  responsesRequestSchema,
} from "@/modules/openai-proxy/contracts";
import { OpenAIProxyError } from "@/modules/openai-proxy/errors";
import {
  prepareChatCompletion,
  prepareResponsesRequest,
} from "@/modules/openai-proxy/request-mapper";

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

describe("OpenAI proxy protocol mapping", () => {
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
