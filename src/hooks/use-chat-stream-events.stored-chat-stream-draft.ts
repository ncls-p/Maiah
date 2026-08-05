"use client";

import { isChatStreamEvent,type ChatMessage,type ChatStreamEvent,type PendingToolApproval } from "@/components/chat/chat-types";

export type StoredChatStreamDraft = {
  conversationId: string;
  assistantMessage: ChatMessage;
  pendingApprovals?: PendingToolApproval[];
  pendingApproval?: PendingToolApproval | null;
  updatedAt: number;
};

const STREAM_DRAFT_PREFIX = "ai-hub-chat-stream-draft:";
export const STREAM_DRAFT_EVENT = "ai-hub-chat-stream-draft-updated";
const STREAM_DRAFT_TTL_MS = 30 * 60 * 1000;
export const STREAM_RENDER_BATCH_MS = 48;
export const STREAM_DRAFT_WRITE_BATCH_MS = 750;
export const TOOL_CALL_PART_TYPE = "tool-call";

function draftKey(conversationId: string) {
  return `${STREAM_DRAFT_PREFIX}${conversationId}`;
}

export function getStoredChatStreamDraft(conversationId: string): StoredChatStreamDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(conversationId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as StoredChatStreamDraft;
    if (!draft?.assistantMessage || Date.now() - draft.updatedAt > STREAM_DRAFT_TTL_MS) {
      window.localStorage.removeItem(draftKey(conversationId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearStoredChatStreamDraft(conversationId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(conversationId));
  window.dispatchEvent(
    new CustomEvent(STREAM_DRAFT_EVENT, {
      detail: { conversationId, draft: null },
    }),
  );
}

export function storeChatStreamDraft(draft: StoredChatStreamDraft, options: { notify?: boolean } = {}) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftKey(draft.conversationId), JSON.stringify(draft));
  if (options.notify === false) return;
  window.dispatchEvent(
    new CustomEvent(STREAM_DRAFT_EVENT, {
      detail: { conversationId: draft.conversationId, draft },
    }),
  );
}

export function mergeStoredDraft(messages: ChatMessage[], draft: StoredChatStreamDraft | null) {
  if (!draft) return messages;
  const existingIndex = messages.findIndex((message) => message.id === draft.assistantMessage.id);
  if (existingIndex === -1) {
    return [...messages, draft.assistantMessage];
  }

  const existing = messages[existingIndex];
  if (existing.status === "completed" || existing.status === "failed") {
    clearStoredChatStreamDraft(draft.conversationId);
    return messages;
  }

  const next = [...messages];
  next[existingIndex] = {
    ...existing,
    ...draft.assistantMessage,
    parts: draft.assistantMessage.parts.length > 0 ? draft.assistantMessage.parts : existing.parts,
  };
  return next;
}

export function approvalsFromDraft(draft: StoredChatStreamDraft | null) {
  if (!draft) return [];
  if (draft.pendingApprovals) return draft.pendingApprovals;
  return draft.pendingApproval ? [draft.pendingApproval] : [];
}

export function upsertPendingApproval(approvals: PendingToolApproval[], approval: PendingToolApproval) {
  const existingIndex = approvals.findIndex((item) => item.invocationId === approval.invocationId);
  if (existingIndex === -1) return [...approvals, approval];
  const next = [...approvals];
  next[existingIndex] = approval;
  return next;
}

export function removePendingApproval(approvals: PendingToolApproval[], invocationId: string) {
  return approvals.filter((approval) => approval.invocationId !== invocationId);
}

export function filterResolvedApprovals(approvals: PendingToolApproval[], resolvedApprovalIds: Set<string>) {
  return approvals.filter((approval) => !resolvedApprovalIds.has(approval.invocationId));
}

export function parseStreamEventText(eventText: string): ChatStreamEvent | null {
  if (!eventText.trim()) return null;

  const data = eventText
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  const payload = data || eventText.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  return isChatStreamEvent(parsed) ? parsed : null;
}
