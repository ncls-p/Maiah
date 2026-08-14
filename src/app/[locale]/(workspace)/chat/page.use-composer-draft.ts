"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  chatComposerDraftKey,
  readChatComposerDraft,
  writeChatComposerDraft,
} from "@/components/chat/chat-composer-draft";
import type { ChatAttachment } from "@/components/chat/chat-types";

export function useComposerDraft(
  workspaceId: string | null | undefined,
  selectedAgentId: string | null,
  activeConversationId: string | null,
) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const composerDraftScopeRef = useRef<{
    workspaceId: string;
    agentId: string;
    conversationId: string | null;
  } | null>(null);

  const saveCurrentComposerDraft = useCallback(() => {
    const scope = composerDraftScopeRef.current;
    if (!scope) return;
    writeChatComposerDraft(
      scope.workspaceId,
      scope.agentId,
      scope.conversationId,
      { input, attachments },
    );
  }, [attachments, input]);

  const restoreComposerDraft = useCallback(
    (nextAgentId: string, nextConversationId: string | null) => {
      if (!workspaceId || !nextAgentId) return;
      saveCurrentComposerDraft();
      const nextKey = chatComposerDraftKey(
        workspaceId,
        nextAgentId,
        nextConversationId,
      );
      const current = composerDraftScopeRef.current;
      const currentKey = current
        ? chatComposerDraftKey(
            current.workspaceId,
            current.agentId,
            current.conversationId,
          )
        : null;
      composerDraftScopeRef.current = {
        workspaceId,
        agentId: nextAgentId,
        conversationId: nextConversationId,
      };
      if (currentKey === nextKey) return;
      const nextDraft = readChatComposerDraft(
        workspaceId,
        nextAgentId,
        nextConversationId,
      );
      setInput(nextDraft.input);
      setAttachments(nextDraft.attachments);
    },
    [saveCurrentComposerDraft, workspaceId],
  );

  useEffect(() => {
    if (!workspaceId || !selectedAgentId) return;
    const expectedKey = chatComposerDraftKey(
      workspaceId,
      selectedAgentId,
      activeConversationId,
    );
    const current = composerDraftScopeRef.current;
    const currentKey = current
      ? chatComposerDraftKey(
          current.workspaceId,
          current.agentId,
          current.conversationId,
        )
      : null;
    if (currentKey !== expectedKey) {
      restoreComposerDraft(selectedAgentId, activeConversationId);
    }
  }, [
    activeConversationId,
    restoreComposerDraft,
    selectedAgentId,
    workspaceId,
  ]);

  useEffect(() => {
    saveCurrentComposerDraft();
  }, [saveCurrentComposerDraft]);

  return {
    attachments,
    composerDraftScopeRef,
    input,
    restoreComposerDraft,
    saveCurrentComposerDraft,
    setAttachments,
    setInput,
  };
}
