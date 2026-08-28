"use client";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import {
  chatTodoListFromToolPart,
  toolPartHasStandaloneRendering,
  toolPartMatchesApproval,
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
import type * as React from "react";
import { memo, useMemo } from "react";
import { areMessageContentPropsEqual } from "./chat-message-rendering.are-message-content-props-equal";
import {
  UserMessageFiles,
  findStreamingTextPartIndex,
  renderAssistantMessagePart,
  stepSequenceForParts,
} from "./chat-message-rendering.message-content.section-1";
import { MessageContentProps } from "./chat-message-rendering.message-content-props";
import {
  PendingApprovalCard,
  RichEditor,
  StreamingThinking,
} from "./chat-message-rendering.rich-editor";
import { WorkPhase } from "./chat-message-rendering.work-phase";
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
