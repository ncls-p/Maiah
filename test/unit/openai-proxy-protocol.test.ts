import { describe,expect,it } from "vitest";

import {
chatCompletionRequestSchema,
responsesRequestSchema,
} from "@/modules/openai-proxy/contracts";
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
});
