import { bedrockEvents } from "./bedrock-event-fixture";

export type Protocol = "responses" | "chat" | "anthropic" | "bedrock";
export const toolInput = { options: { color: "White" } };
const input = JSON.stringify(toolInput);
const call = {
  type: "function_call",
  id: "fc_1",
  call_id: "call_1",
  name: "mcp_catalog",
  arguments: input,
  status: "completed",
};
const anthropicCall = {
  type: "tool_use",
  id: "call_1",
  name: "mcp_catalog",
  input: toolInput,
};
const usage = { input_tokens: 2, output_tokens: 3 };

export function providerReply(protocol: Protocol, streaming: boolean) {
  if (!streaming) {
    const replies = {
      responses: {
        id: "resp_1",
        created_at: 1,
        model: "test-model",
        status: "completed",
        output: [call],
        usage,
      },
      chat: {
        id: "chat_1",
        created: 1,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "mcp_catalog", arguments: input },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      },
      anthropic: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "test-model",
        content: [anthropicCall],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage,
      },
      bedrock: {
        output: {
          message: {
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "call_1",
                  name: "mcp_catalog",
                  input: toolInput,
                },
              },
            ],
          },
        },
        stopReason: "tool_use",
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        metrics: { latencyMs: 1 },
      },
    };
    return Response.json(replies[protocol]);
  }
  if (protocol === "bedrock")
    return new Response(
      bedrockEvents([
        {
          contentBlockStart: {
            contentBlockIndex: 0,
            start: { toolUse: { toolUseId: "call_1", name: "mcp_catalog" } },
          },
        },
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { toolUse: { input } },
          },
        },
        { contentBlockStop: { contentBlockIndex: 0 } },
        { messageStop: { stopReason: "tool_use" } },
        {
          metadata: {
            usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
          },
        },
      ]),
      { headers: { "content-type": "application/vnd.amazon.eventstream" } },
    );
  const events = {
    responses: [
      {
        type: "response.created",
        response: { id: "resp_1", created_at: 1, model: "test-model" },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...call, arguments: "", status: "in_progress" },
      },
      {
        type: "response.function_call_arguments.delta",
        output_index: 0,
        item_id: "fc_1",
        delta: input,
      },
      { type: "response.output_item.done", output_index: 0, item: call },
      { type: "response.completed", response: { usage, status: "completed" } },
    ],
    chat: [
      {
        id: "chat_1",
        created: 1,
        model: "test-model",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  type: "function",
                  function: { name: "mcp_catalog", arguments: input },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: "chat_1",
        created: 1,
        model: "test-model",
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      },
    ],
    anthropic: [
      {
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "test-model",
          content: [],
          usage,
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { ...anthropicCall, input: {} },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: input },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 3 },
      },
      { type: "message_stop" },
    ],
  };
  return new Response(
    events[protocol]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}
