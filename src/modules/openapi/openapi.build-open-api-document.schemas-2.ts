export const openApiSchemasPart2 = {
  OpenAIModelList: {
    type: "object",
    required: ["object", "data"],
    properties: {
      object: { type: "string", const: "list" },
      data: {
        type: "array",
        items: { $ref: "#/components/schemas/OpenAIModel" },
      },
    },
  },
  OpenAIFunctionTool: {
    type: "object",
    required: ["type", "function"],
    properties: {
      type: { type: "string", const: "function" },
      function: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", maxLength: 64 },
          description: { type: "string" },
          parameters: { type: "object", additionalProperties: true },
          strict: { type: "boolean" },
        },
      },
    },
  },
  OpenAIResponsesFunctionTool: {
    type: "object",
    required: ["type", "name"],
    properties: {
      type: { type: "string", const: "function" },
      name: { type: "string", maxLength: 64 },
      description: { type: "string" },
      parameters: { type: "object", additionalProperties: true },
      strict: { type: "boolean" },
    },
  },
  OpenAIChatCompletionRequest: {
    type: "object",
    required: ["model", "messages"],
    additionalProperties: true,
    properties: {
      model: { type: "string" },
      messages: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["role"],
          additionalProperties: true,
          properties: {
            role: {
              type: "string",
              enum: [
                "system",
                "developer",
                "user",
                "assistant",
                "tool",
                "function",
              ],
            },
            content: {},
            tool_call_id: { type: "string" },
            tool_calls: { type: "array", items: { type: "object" } },
          },
        },
      },
      stream: { type: "boolean", default: false },
      stream_options: {
        type: "object",
        properties: { include_usage: { type: "boolean" } },
      },
      max_completion_tokens: { type: "integer", minimum: 1 },
      max_tokens: { type: "integer", minimum: 1, deprecated: true },
      temperature: { type: "number", minimum: 0, maximum: 2 },
      top_p: { type: "number", minimum: 0, maximum: 1 },
      presence_penalty: { type: "number", minimum: -2, maximum: 2 },
      frequency_penalty: { type: "number", minimum: -2, maximum: 2 },
      seed: { type: "integer" },
      stop: {
        oneOf: [
          { type: "string" },
          { type: "array", maxItems: 4, items: { type: "string" } },
        ],
      },
      tools: {
        type: "array",
        items: { $ref: "#/components/schemas/OpenAIFunctionTool" },
      },
      tool_choice: {},
      response_format: { type: "object", additionalProperties: true },
      n: { type: "integer", const: 1, default: 1 },
    },
  },
  OpenAIChatCompletion: {
    type: "object",
    required: ["id", "object", "created", "model", "choices", "usage"],
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      object: { type: "string", const: "chat.completion" },
      created: { type: "integer" },
      model: { type: "string" },
      choices: { type: "array", items: { type: "object" } },
      usage: { type: "object", additionalProperties: true },
    },
  },
  OpenAIResponsesRequest: {
    type: "object",
    required: ["model", "input"],
    additionalProperties: true,
    properties: {
      model: { type: "string" },
      input: {
        oneOf: [
          { type: "string" },
          { type: "array", minItems: 1, items: { type: "object" } },
        ],
      },
      instructions: { type: "string" },
      stream: { type: "boolean", default: false },
      max_output_tokens: { type: "integer", minimum: 1 },
      temperature: { type: "number", minimum: 0, maximum: 2 },
      top_p: { type: "number", minimum: 0, maximum: 1 },
      tools: {
        type: "array",
        items: {
          $ref: "#/components/schemas/OpenAIResponsesFunctionTool",
        },
      },
      tool_choice: {},
      text: { type: "object", additionalProperties: true },
      metadata: {
        type: "object",
        additionalProperties: { type: "string" },
      },
      previous_response_id: {
        type: ["string", "null"],
        description: "Rejected: the Maiah proxy is stateless.",
      },
      background: {
        type: "boolean",
        description: "Rejected when true.",
      },
    },
  },
  OpenAIResponse: {
    type: "object",
    required: [
      "id",
      "object",
      "created_at",
      "status",
      "model",
      "output",
      "usage",
    ],
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      object: { type: "string", const: "response" },
      created_at: { type: "integer" },
      status: {
        type: "string",
        enum: ["completed", "incomplete", "failed", "in_progress"],
      },
      model: { type: "string" },
      output: { type: "array", items: { type: "object" } },
      usage: { type: ["object", "null"], additionalProperties: true },
      error: { type: ["object", "null"], additionalProperties: true },
    },
  },
};
