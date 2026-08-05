import { type IncomingMessage,type Server } from "node:http";

export const upstreamState: {
  server: Server | null;
  baseUrl: string;
} = { server: null, baseUrl: "" };

export const generatedDefinition = {
  schemaVersion: 1,
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      label: "API trigger",
      position: { x: 80, y: 180 },
      parameters: {},
      settings: {
        timeoutMs: 30_000,
        maxRetries: 0,
        retryDelayMs: 1_000,
      },
    },
    {
      id: "summary",
      type: "data.template",
      label: "Prepare summary",
      position: { x: 380, y: 180 },
      parameters: {
        template: "Summary: {{message}}",
        outputPath: "summary",
      },
      settings: {
        timeoutMs: 30_000,
        maxRetries: 0,
        retryDelayMs: 1_000,
      },
    },
  ],
  edges: [
    {
      id: "edge-trigger-summary",
      source: "trigger",
      target: "summary",
      sourceHandle: null,
    },
  ],
};

export function usage() {
  return {
    prompt_tokens: 24,
    completion_tokens: 12,
    total_tokens: 36,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0 },
  };
}

export async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    model?: string;
    messages?: Array<{
      role?: string;
      tool_calls?: Array<{ function?: { name?: string } }>;
    }>;
  };
}

export function writeStream(response: import("node:http").ServerResponse, chunks: unknown[]) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
  });
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.end("data: [DONE]\n\n");
}

export function writeToolCall(
  response: import("node:http").ServerResponse,
  input: {
    created: number;
    model: string;
    id: string;
    name: string;
    arguments: unknown;
  },
) {
  writeStream(response, [
    {
      id: `chatcmpl-${input.id}`,
      object: "chat.completion.chunk",
      created: input.created,
      model: input.model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: input.id,
                type: "function",
                function: {
                  name: input.name,
                  arguments: JSON.stringify(input.arguments),
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: `chatcmpl-${input.id}`,
      object: "chat.completion.chunk",
      created: input.created,
      model: input.model,
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      usage: usage(),
    },
  ]);
}
