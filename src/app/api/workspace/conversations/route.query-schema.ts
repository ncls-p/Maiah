import { z } from "zod";

const DEFAULT_CONVERSATION_LIMIT = 50;
const MAX_CONVERSATION_LIMIT = 100;

export const querySchema = z.object({
  workspaceId: z.uuid().optional(),
  agentId: z.uuid().optional(),
  before: z.string().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  includeMeta: z.enum(["true", "false"]).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CONVERSATION_LIMIT)
    .default(DEFAULT_CONVERSATION_LIMIT),
});

export type ConversationCursor = {
  version: 1 | 2;
  updatedAt: Date;
  id: string;
  pinned?: boolean;
  sidebarOrder?: number | null;
};

export function parseConversationCursor(value: string | undefined) {
  if (!value) return null;
  if (value.startsWith("v2.")) {
    try {
      const decoded = JSON.parse(
        Buffer.from(value.slice(3), "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      const updatedAt = new Date(String(decoded.updatedAt ?? ""));
      if (
        decoded.v !== 2 ||
        typeof decoded.id !== "string" ||
        typeof decoded.pinned !== "boolean" ||
        (decoded.sidebarOrder !== null &&
          typeof decoded.sidebarOrder !== "number") ||
        Number.isNaN(updatedAt.getTime())
      ) {
        return null;
      }
      return {
        version: 2,
        updatedAt,
        id: decoded.id,
        pinned: decoded.pinned,
        sidebarOrder: decoded.sidebarOrder as number | null,
      } satisfies ConversationCursor;
    } catch {
      return null;
    }
  }

  const [dateValue, id] = value.split("|");
  const updatedAt = new Date(dateValue ?? "");
  if (!id || Number.isNaN(updatedAt.getTime())) return null;
  return { version: 1, updatedAt, id } satisfies ConversationCursor;
}

export function createConversationCursor(
  conversation:
    | {
        id: string;
        updatedAt: Date | string;
        pinnedAt?: Date | string | null;
        sidebarOrder?: number | null;
      }
    | undefined,
) {
  if (!conversation) return null;
  const updatedAt =
    conversation.updatedAt instanceof Date
      ? conversation.updatedAt.toISOString()
      : conversation.updatedAt;
  if (!("pinnedAt" in conversation) || !("sidebarOrder" in conversation)) {
    return `${updatedAt}|${conversation.id}`;
  }
  return `v2.${Buffer.from(
    JSON.stringify({
      v: 2,
      updatedAt,
      id: conversation.id,
      pinned: Boolean(conversation.pinnedAt),
      sidebarOrder: conversation.sidebarOrder ?? null,
    }),
  ).toString("base64url")}`;
}
