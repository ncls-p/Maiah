"use client";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import {
  chatTodoListFromToolPart,
  toolPartHasStandaloneRendering,
  toolPartMatchesApproval,
  chatFileAttachmentFromPartContent,
  chatImageAttachmentFromPartContent,
  codeWorkspaceArtifactFromPartContent,
} from "@/components/chat/chat-message-rendering-utils";
import {
  citationsFromMessage,
  groupWorkPhaseParts,
  renderablePartsFromMessage,
  textFromMessage,
  type ChatMessagePart,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import { CitationBlock } from "@/components/chat/citation-block";
import * as React from "react";
import { memo, useMemo } from "react";
import { areMessageContentPropsEqual } from "./chat-message-rendering.are-message-content-props-equal";
import { MessageContentProps } from "./chat-message-rendering.message-content-props";
import {
  PendingApprovalCard,
  RichEditor,
  StreamingThinking,
  ErrorPart,
} from "./chat-message-rendering.rich-editor";
import { WorkPhase } from "./chat-message-rendering.work-phase";
import {
  ChatFileAttachmentCard,
  ChatImageAttachmentCard,
  CodeWorkspaceArtifactCard,
  CodeWorkspaceArtifactSummary,
} from "@/components/chat/code-workspace-artifact-card";
import { ConversationSummaryCard } from "@/components/chat/conversation-summary-card";
import {
  SuggestionsPart,
  ThinkingPart,
} from "./chat-message-rendering.are-tool-part-card-props-equal";
import { ToolPartCard } from "./chat-message-rendering.tool-part-card";

export const MessageContent = memo(function MessageContent({
  message,
  isEditing,
  editingContent,
  isSaving,
  isAnimating,
  onEditingContentChange,
  onCancelEdit,
  onSaveEdit,
  pendingApprovals,
  onApproveTool,
  onRejectTool,
  onSuggestionClick,
  showSuggestions = true,
  workspaceId,
  workspaceArtifactDisplay = "full",
}: MessageContentProps) {
  const content = useMemo(() => textFromMessage(message), [message]);
  const citations = useMemo(() => citationsFromMessage(message), [message]);
  const isAssistant = message.role === "assistant";
  const renderableParts = useMemo(
    () =>
      renderablePartsFromMessage(message).filter(
        (part) =>
          (part.type !== "text" || part.content.trim().length > 0) &&
          !chatTodoListFromToolPart(part),
      ),
    [message],
  );
  const partGroups = useMemo(
    () =>
      groupWorkPhaseParts(renderableParts, {
        isStandalonePart: toolPartHasStandaloneRendering,
      }),
    [renderableParts],
  );
  const stepSequenceByPartIndex = useMemo(
    () => stepSequenceForParts(renderableParts),
    [renderableParts],
  );
  const streamingTextPartIndex = useMemo(
    () => findStreamingTextPartIndex(renderableParts, isAnimating),
    [isAnimating, renderableParts],
  );
  const { approvalByPartIndex, standaloneApprovals } = useMemo(() => {
    const approvalByIndex = new Map<number, PendingToolApproval>();
    const matchedApprovalIds = new Set<string>();
    const findUnmatchedApproval = (
      pendingApprovals: PendingToolApproval[],
      part: (typeof renderableParts)[number],
    ): PendingToolApproval | undefined =>
      pendingApprovals.find(
        (item) =>
          !matchedApprovalIds.has(item.invocationId) &&
          toolPartMatchesApproval(part, item),
      );
    if (message.status === "streaming") {
      for (
        let partIndex = renderableParts.length - 1;
        partIndex >= 0;
        partIndex -= 1
      ) {
        const part = renderableParts[partIndex];
        if (part.type !== "tool-call") continue;
        const approval = findUnmatchedApproval(pendingApprovals, part);
        if (!approval) continue;
        approvalByIndex.set(partIndex, approval);
        matchedApprovalIds.add(approval.invocationId);
      }
    }
    return {
      approvalByPartIndex: approvalByIndex,
      standaloneApprovals:
        message.status === "streaming"
          ? pendingApprovals.filter(
              (approval) => !matchedApprovalIds.has(approval.invocationId),
            )
          : [],
    };
  }, [message.status, pendingApprovals, renderableParts]);
  if (isEditing) {
    return (
      <RichEditor
        value={editingContent}
        onChange={onEditingContentChange}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
        disabled={isSaving}
      />
    );
  }
  if (!isAssistant) {
    return (
      <UserMessageFiles
        message={message}
        content={content}
        workspaceArtifactDisplay={workspaceArtifactDisplay}
        renderableParts={renderableParts}
      />
    );
  }
  const renderAssistantPart = (
    part: ChatMessagePart,
    partIndex: number,
  ): React.ReactNode =>
    renderAssistantMessagePart({
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
    });
  return (
    <div className="flex flex-col gap-2">
      {citations.length > 0 ? (
        <CitationBlock citations={citations} workspaceId={workspaceId} />
      ) : null}
      {standaloneApprovals.length > 0
        ? standaloneApprovals.map((approval, approvalIndex) => (
            <PendingApprovalCard
              key={approval.invocationId}
              pendingApproval={approval}
              sequence={approvalIndex + 1}
              onApprove={onApproveTool}
              onReject={onRejectTool}
            />
          ))
        : null}
      {renderableParts.length > 0 ? (
        partGroups.map((group) => {
          if (group.type === "part") {
            return renderAssistantPart(group.part, group.partIndex);
          }
          const firstPartIndex = group.parts[0].partIndex;
          return (
            <WorkPhase
              key={`${message.id}-work-phase-${firstPartIndex}`}
              parts={group.parts}
              sequence={stepSequenceByPartIndex.get(firstPartIndex) ?? 1}
              hasVisibleResponseAfter={group.hasVisibleResponseAfter}
              hasPendingApproval={group.parts.some(({ partIndex }) =>
                approvalByPartIndex.has(partIndex),
              )}
              messageStatus={message.status}
            >
              {group.parts.map(({ part, partIndex }) =>
                renderAssistantPart(part, partIndex),
              )}
            </WorkPhase>
          );
        })
      ) : standaloneApprovals.length === 0 ? (
        content ? (
          <ChatMarkdown isAnimating={isAnimating}>{content}</ChatMarkdown>
        ) : isAnimating ? (
          <StreamingThinking />
        ) : null
      ) : null}
    </div>
  );
}, areMessageContentPropsEqual);

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
