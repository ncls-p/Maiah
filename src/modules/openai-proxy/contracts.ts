import { z } from "zod";

const toolChoiceSchema = z.union([
  z.enum(["none", "auto", "required"]),
  z
    .object({
      type: z.literal("function"),
      function: z.object({ name: z.string().min(1) }).loose(),
    })
    .loose(),
  z
    .object({
      type: z.literal("function"),
      name: z.string().min(1),
    })
    .loose(),
]);

const functionDefinitionSchema = z
  .object({
    name: z.string().min(1).max(64),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
    defer_loading: z.boolean().optional(),
  })
  .strict();

const chatToolSchema = z
  .object({
    type: z.literal("function"),
    function: functionDefinitionSchema,
  })
  .loose();

const chatMessageSchema = z
  .object({
    role: z.enum([
      "system",
      "developer",
      "user",
      "assistant",
      "tool",
      "function",
    ]),
    content: z.unknown().optional(),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.unknown().optional(),
    function_call: z.unknown().optional(),
  })
  .loose();

const responseFormatSchema = z.union([
  z.object({ type: z.literal("text") }).loose(),
  z.object({ type: z.literal("json_object") }).loose(),
  z
    .object({
      type: z.literal("json_schema"),
      json_schema: z
        .object({
          name: z.string().min(1).max(64),
          description: z.string().optional(),
          schema: z.record(z.string(), z.unknown()),
          strict: z.boolean().optional(),
        })
        .loose(),
    })
    .loose(),
]);

export const chatCompletionRequestSchema = z
  .object({
    model: z.string().trim().min(1),
    messages: z.array(chatMessageSchema).min(1),
    stream: z.boolean().default(false),
    stream_options: z
      .object({ include_usage: z.boolean().optional() })
      .loose()
      .optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    max_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    seed: z.number().int().optional(),
    stop: z.union([z.string(), z.array(z.string()).max(4)]).optional(),
    tools: z.array(chatToolSchema).optional(),
    tool_choice: toolChoiceSchema.optional(),
    functions: z.array(functionDefinitionSchema).optional(),
    function_call: z
      .union([
        z.enum(["none", "auto"]),
        z.object({ name: z.string().min(1) }).strict(),
      ])
      .optional(),
    parallel_tool_calls: z.boolean().optional(),
    response_format: responseFormatSchema.optional(),
    n: z.number().int().positive().optional(),
    logprobs: z.boolean().optional(),
    top_logprobs: z.number().int().min(0).max(20).optional(),
    modalities: z.array(z.string()).optional(),
    audio: z.unknown().optional(),
    user: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    store: z.boolean().optional(),
    service_tier: z.string().optional(),
    reasoning_effort: z.string().optional(),
    web_search_options: z.unknown().optional(),
    prediction: z.unknown().optional(),
    verbosity: z.string().optional(),
  })
  .strict();

const responsesTextFormatSchema = z.union([
  z.object({ type: z.literal("text") }).loose(),
  z.object({ type: z.literal("json_object") }).loose(),
  z
    .object({
      type: z.literal("json_schema"),
      name: z.string().min(1).max(64),
      description: z.string().optional(),
      schema: z.record(z.string(), z.unknown()),
      strict: z.boolean().optional(),
    })
    .loose(),
]);

const responsesFunctionToolSchema = z
  .object({
    type: z.literal("function"),
    name: z.string().min(1).max(64),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
    defer_loading: z.boolean().optional(),
  })
  .strict();

export const responsesRequestSchema = z
  .object({
    model: z.string().trim().min(1),
    input: z.union([
      z.string(),
      z.array(z.record(z.string(), z.unknown())).min(1),
    ]),
    instructions: z.string().optional(),
    stream: z.boolean().default(false),
    max_output_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    tools: z.array(responsesFunctionToolSchema).optional(),
    tool_choice: toolChoiceSchema.optional(),
    parallel_tool_calls: z.boolean().optional(),
    text: z
      .object({ format: responsesTextFormatSchema.optional() })
      .loose()
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    store: z.boolean().optional(),
    truncation: z.enum(["auto", "disabled"]).optional(),
    previous_response_id: z.string().nullable().optional(),
    background: z.boolean().optional(),
    include: z.array(z.string()).optional(),
    reasoning: z
      .object({ effort: z.string().optional(), summary: z.string().optional() })
      .loose()
      .optional(),
    service_tier: z.string().optional(),
    safety_identifier: z.string().optional(),
    prompt_cache_key: z.string().optional(),
    prompt: z.unknown().optional(),
    conversation: z.unknown().optional(),
    context_management: z.unknown().optional(),
    max_tool_calls: z.number().int().positive().optional(),
    top_logprobs: z.number().int().min(0).max(20).optional(),
    user: z.string().optional(),
  })
  .strict();

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;
export type ResponsesRequest = z.infer<typeof responsesRequestSchema>;
export type FunctionDefinition = z.infer<typeof functionDefinitionSchema>;
export type ProxyToolChoice = z.infer<typeof toolChoiceSchema>;

export type ProxyResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
      type: "json_schema";
      name: string;
      description?: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
