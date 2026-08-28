import { ChatMarkdown } from "@/components/chat/chat-markdown";
import {
  chatFileAttachmentFromPartContent,
  chatImageAttachmentFromPartContent,
  codeWorkspaceArtifactFromPartContent,
} from "@/components/chat/chat-message-rendering-utils";
import {
  type ChatMessagePart,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  ChatFileAttachmentCard,
  ChatImageAttachmentCard,
  CodeWorkspaceArtifactCard,
  CodeWorkspaceArtifactSummary,
} from "@/components/chat/code-workspace-artifact-card";
import { ConversationSummaryCard } from "@/components/chat/conversation-summary-card";
import type * as React from "react";
import {
  SuggestionsPart,
  ThinkingPart,
} from "./chat-message-rendering.are-tool-part-card-props-equal";
import type { MessageContentProps } from "./chat-message-rendering.message-content-props";
import { ErrorPart } from "./chat-message-rendering.rich-editor";
import { ToolPartCard } from "./chat-message-rendering.tool-part-card";

export function UserMessageFiles({
  message,
  content,
  workspaceArtifactDisplay = "full",
  renderableParts,
}: {
  message: MessageContentProps["message"];
  content: string;
  workspaceArtifactDisplay?: MessageContentProps["workspaceArtifactDisplay"];
  renderableParts: ChatMessagePart[];
}): React.ReactNode {
  const fileParts = renderableParts.filter((part) => part.type === "file");
  if (fileParts.length === 0) return content;
  return (
    <div className="flex flex-col gap-2">
      {content ? <div>{content}</div> : null}
      {fileParts.map((part, partIndex) => {
        const key = `${message.id}-${part.type}-${partIndex}`;
        const imageAttachment = chatImageAttachmentFromPartContent(
          part.content,
        );
        if (imageAttachment) {
          return (
            <ChatImageAttachmentCard key={key} attachment={imageAttachment} />
          );
        }
        const fileAttachment = chatFileAttachmentFromPartContent(part.content);
        if (fileAttachment) {
          return (
            <ChatFileAttachmentCard key={key} attachment={fileAttachment} />
          );
        }
        const fileArtifact = codeWorkspaceArtifactFromPartContent(part.content);
        if (!fileArtifact) return null;
        return workspaceArtifactDisplay === "summary" ? (
          <CodeWorkspaceArtifactSummary key={key} artifact={fileArtifact} />
        ) : (
          <CodeWorkspaceArtifactCard key={key} artifact={fileArtifact} />
        );
      })}
    </div>
  );
}

export function stepSequenceForParts(parts: ChatMessagePart[]) {
  const sequenceByIndex = new Map<number, number>();
  let sequence = 1;
  parts.forEach((part, partIndex) => {
    if (
      part.type !== "reasoning" &&
      part.type !== "tool-call" &&
      part.type !== "tool-result"
    ) {
      return;
    }
    sequenceByIndex.set(partIndex, sequence);
    sequence += 1;
  });
  return sequenceByIndex;
}

export function findStreamingTextPartIndex(
  parts: ChatMessagePart[],
  isAnimating: boolean,
): number {
  if (!isAnimating) return -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index].type === "text") return index;
  }
  return -1;
}

export interface AssistantMessagePartContext {
  message: MessageContentProps["message"];
  part: ChatMessagePart;
  partIndex: number;
  showSuggestions: boolean;
  workspaceId: MessageContentProps["workspaceId"];
  workspaceArtifactDisplay: NonNullable<
    MessageContentProps["workspaceArtifactDisplay"]
  >;
  isAnimating: boolean;
  streamingTextPartIndex: number;
  onSuggestionClick: MessageContentProps["onSuggestionClick"];
  onApproveTool: MessageContentProps["onApproveTool"];
  onRejectTool: MessageContentProps["onRejectTool"];
  stepSequenceByPartIndex: ReadonlyMap<number, number>;
  approvalByPartIndex: ReadonlyMap<number, PendingToolApproval>;
}

export function renderAssistantMessagePart({
  message,
  part,
  partIndex,
  showSuggestions,
  workspaceId,
  workspaceArtifactDisplay,
  isAnimating,
  streamingTextPartIndex,
  onSuggestionClick,
  onApproveTool,
  onRejectTool,
  stepSequenceByPartIndex,
  approvalByPartIndex,
}: AssistantMessagePartContext): React.ReactNode {
  const key = `${message.id}-${part.type}-${partIndex}`;
  if (part.type === "impact") return null;
  if (part.type === "summary")
    return <ConversationSummaryCard key={key} summary={part.content} />;
  if (part.type === "suggestions") {
    if (!showSuggestions) return null;
    return (
      <SuggestionsPart
        key={key}
        part={part}
        onSuggestionClick={onSuggestionClick}
      />
    );
  }
  if (part.type === "reasoning") {
    return <ThinkingPart key={key} part={part} />;
  }
  if (part.type === "error") {
    return <ErrorPart key={key} part={part} />;
  }
  if (part.type === "file") {
    const imageAttachment = chatImageAttachmentFromPartContent(part.content);
    if (imageAttachment) {
      return <ChatImageAttachmentCard key={key} attachment={imageAttachment} />;
    }
    const fileAttachment = chatFileAttachmentFromPartContent(part.content);
    if (fileAttachment) {
      return <ChatFileAttachmentCard key={key} attachment={fileAttachment} />;
    }
    const fileArtifact = codeWorkspaceArtifactFromPartContent(part.content);
    if (!fileArtifact) return null;
    return workspaceArtifactDisplay === "summary" ? (
      <CodeWorkspaceArtifactSummary key={key} artifact={fileArtifact} />
    ) : (
      <CodeWorkspaceArtifactCard
        key={key}
        artifact={fileArtifact}
        workspaceId={workspaceId}
      />
    );
  }
  if (part.type === "tool-call" || part.type === "tool-result") {
    return (
      <ToolPartCard
        key={key}
        part={part}
        sequence={stepSequenceByPartIndex.get(partIndex) ?? 1}
        messageStatus={message.status}
        approval={approvalByPartIndex.get(partIndex)}
        workspaceId={workspaceId}
        workspaceArtifactDisplay={workspaceArtifactDisplay}
        onApprove={onApproveTool}
        onReject={onRejectTool}
      />
    );
  }
  return (
    <ChatMarkdown
      key={key}
      isAnimating={isAnimating && partIndex === streamingTextPartIndex}
    >
      {part.content}
    </ChatMarkdown>
  );
}
