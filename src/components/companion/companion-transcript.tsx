"use client";
import type { RefObject } from "react";
import type { useChatStream } from "@/hooks/use-chat-stream";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { QuestionFormContext } from "@/components/chat/question-form";
export function CompanionTranscript({
  stream,
  loaded,
  available,
  workspaceId,
  conversationId,
  bottomRef,
  onSuggestionClick,
  submit,
}: {
  stream: ReturnType<typeof useChatStream>;
  loaded: boolean;
  available: boolean;
  workspaceId: string;
  conversationId: string | null;
  bottomRef: RefObject<HTMLDivElement | null>;
  onSuggestionClick: (value: string) => void;
  submit: (content: string) => Promise<boolean>;
}) {
  return (
    <QuestionFormContext.Provider
      value={{
        conversationId,
        enabled: available && loaded && !stream.sending,
        submit,
      }}
    >
      <ChatMessageList
        messages={stream.messages}
        sending={stream.sending}
        loading={!loaded}
        workspaceId={workspaceId}
        conversationId={conversationId}
        bottomRef={bottomRef}
        pendingApprovals={stream.pendingApprovals}
        onApproveTool={(approval) =>
          void stream.resolveApproval("approve", approval.invocationId)
        }
        onRejectTool={(approval) =>
          void stream.resolveApproval("reject", approval.invocationId)
        }
        onSuggestionClick={onSuggestionClick}
      />
    </QuestionFormContext.Provider>
  );
}
