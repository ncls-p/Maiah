import { z } from "zod";

const textBlockSchema = z
  .object({ type: z.literal("text"), text: z.string() })
  .loose();

const imageBlockSchema = z
  .object({
    type: z.literal("image"),
    source: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("base64"),
        media_type: z.enum([
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
        ]),
        data: z.string().min(1),
      }),
      z.object({ type: z.literal("url"), url: z.url() }),
    ]),
  })
  .loose();

const toolUseBlockSchema = z
  .object({
    type: z.literal("tool_use"),
    id: z.string().min(1),
    name: z.string().min(1),
    input: z.unknown(),
  })
  .loose();

const toolResultBlockSchema = z
  .object({
    type: z.literal("tool_result"),
    tool_use_id: z.string().min(1),
    content: z.union([z.string(), z.array(textBlockSchema)]).optional(),
    is_error: z.boolean().optional(),
  })
  .loose();

const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  imageBlockSchema,
  toolUseBlockSchema,
  toolResultBlockSchema,
]);

const messageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.union([z.string(), z.array(contentBlockSchema)]),
  })
  .strict();

const toolSchema = z
  .object({
    name: z.string().min(1).max(128),
    description: z.string().optional(),
    input_schema: z.record(z.string(), z.unknown()),
  })
  .loose();

const toolChoiceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auto"),
    disable_parallel_tool_use: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("any"),
    disable_parallel_tool_use: z.boolean().optional(),
  }),
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("tool"),
    name: z.string().min(1),
    disable_parallel_tool_use: z.boolean().optional(),
  }),
]);

export const anthropicMessagesRequestSchema = z
  .object({
    model: z.string().trim().min(1),
    max_tokens: z.number().int().positive(),
    messages: z.array(messageSchema).min(1),
    system: z.union([z.string(), z.array(textBlockSchema)]).optional(),
    stream: z.boolean().default(false),
    stop_sequences: z.array(z.string()).max(8).optional(),
    temperature: z.number().min(0).max(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().nonnegative().optional(),
    tools: z.array(toolSchema).optional(),
    tool_choice: toolChoiceSchema.optional(),
    metadata: z
      .object({ user_id: z.string().max(256).nullable().optional() })
      .loose()
      .optional(),
  })
  .strict();

export type AnthropicMessagesRequest = z.infer<
  typeof anthropicMessagesRequestSchema
>;
