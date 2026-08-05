import { z } from "zod";

const DEFAULT_CONVERSATION_LIMIT = 50;
const MAX_CONVERSATION_LIMIT = 100;

export const querySchema = z.object({
  workspaceId: z.uuid().optional(),
  agentId: z.uuid().optional(),
  before: z.string().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  includeMeta: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_CONVERSATION_LIMIT).default(DEFAULT_CONVERSATION_LIMIT),
});

export function createConversationCursor(conversation: { id: string; updatedAt: Date | string } | undefined) {
  if (!conversation) return null;
  const updatedAt = conversation.updatedAt instanceof Date ? conversation.updatedAt.toISOString() : conversation.updatedAt;
  return `${updatedAt}|${conversation.id}`;
}
