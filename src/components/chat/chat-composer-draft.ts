"use client";

import type { ChatAttachment } from "@/components/chat/chat-types";

export type ChatComposerDraft = {
  input: string;
  attachments: ChatAttachment[];
};

const STORAGE_PREFIX = "maiah-chat-composer-draft";
const MAX_DRAFT_INPUT_LENGTH = 100_000;
const MAX_DRAFT_ATTACHMENTS = 8;

function storageKey(
  workspaceId: string,
  agentId: string,
  conversationId: string | null,
) {
  return `${STORAGE_PREFIX}:${workspaceId}:${conversationId ?? `new:${agentId}`}`;
}

function emptyDraft(): ChatComposerDraft {
  return { input: "", attachments: [] };
}

function isAttachment(value: unknown): value is ChatAttachment {
  if (!value || typeof value !== "object") return false;
  const attachment = value as Partial<ChatAttachment>;
  return (
    (attachment.kind === "chat_image" || attachment.kind === "chat_file") &&
    typeof attachment.id === "string" &&
    typeof attachment.fileName === "string" &&
    typeof attachment.mimeType === "string" &&
    typeof attachment.size === "number" &&
    typeof attachment.hash === "string" &&
    typeof attachment.url === "string"
  );
}

export function chatComposerDraftKey(
  workspaceId: string,
  agentId: string,
  conversationId: string | null,
) {
  return storageKey(workspaceId, agentId, conversationId);
}

export function readChatComposerDraft(
  workspaceId: string,
  agentId: string,
  conversationId: string | null,
): ChatComposerDraft {
  if (typeof window === "undefined") return emptyDraft();
  try {
    const value = JSON.parse(
      window.localStorage.getItem(
        storageKey(workspaceId, agentId, conversationId),
      ) ?? "{}",
    ) as Partial<ChatComposerDraft>;
    return {
      input:
        typeof value.input === "string"
          ? value.input.slice(0, MAX_DRAFT_INPUT_LENGTH)
          : "",
      attachments: Array.isArray(value.attachments)
        ? value.attachments.filter(isAttachment).slice(0, MAX_DRAFT_ATTACHMENTS)
        : [],
    };
  } catch {
    return emptyDraft();
  }
}

export function writeChatComposerDraft(
  workspaceId: string,
  agentId: string,
  conversationId: string | null,
  draft: ChatComposerDraft,
) {
  if (typeof window === "undefined") return;
  const key = storageKey(workspaceId, agentId, conversationId);
  const normalizedDraft = {
    input: draft.input.slice(0, MAX_DRAFT_INPUT_LENGTH),
    attachments: draft.attachments.slice(0, MAX_DRAFT_ATTACHMENTS),
  };
  if (!normalizedDraft.input && normalizedDraft.attachments.length === 0) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(normalizedDraft));
}

export function removeChatComposerDraft(
  workspaceId: string,
  agentId: string,
  conversationId: string | null,
) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(
    storageKey(workspaceId, agentId, conversationId),
  );
}

export function migrateNewChatComposerDraft(
  workspaceId: string,
  agentId: string,
  conversationId: string,
) {
  if (typeof window === "undefined") return;
  const draftKey = storageKey(workspaceId, agentId, null);
  const draft = window.localStorage.getItem(draftKey);
  if (!draft) return;
  window.localStorage.setItem(
    storageKey(workspaceId, agentId, conversationId),
    draft,
  );
  window.localStorage.removeItem(draftKey);
}
