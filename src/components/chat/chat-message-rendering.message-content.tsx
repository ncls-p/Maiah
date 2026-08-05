"use client";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { chatFileAttachmentFromPartContent,chatImageAttachmentFromPartContent,chatTodoListFromToolPart,codeWorkspaceArtifactFromPartContent,toolPartHasStandaloneRendering,toolPartMatchesApproval } from "@/components/chat/chat-message-rendering-utils";
import { citationsFromMessage,groupWorkPhaseParts,renderablePartsFromMessage,textFromMessage,type ChatMessagePart,type PendingToolApproval } from "@/components/chat/chat-types";
import { CitationBlock } from "@/components/chat/citation-block";
import { ChatFileAttachmentCard,ChatImageAttachmentCard,CodeWorkspaceArtifactCard,CodeWorkspaceArtifactSummary } from "@/components/chat/code-workspace-artifact-card";
import type * as React from "react";
import { memo,useMemo } from "react";
import { areMessageContentPropsEqual } from "./chat-message-rendering.are-message-content-props-equal";
import { SuggestionsPart,ThinkingPart } from "./chat-message-rendering.are-tool-part-card-props-equal";
import { MessageContentProps } from "./chat-message-rendering.message-content-props";
import { ErrorPart,PendingApprovalCard,RichEditor,StreamingThinking } from "./chat-message-rendering.rich-editor";
import { ToolPartCard } from "./chat-message-rendering.tool-part-card";
import { WorkPhase } from "./chat-message-rendering.work-phase";
export const MessageContent = memo(function MessageContent({ message, isEditing, editingContent, isSaving, isAnimating, onEditingContentChange, onCancelEdit, onSaveEdit, pendingApprovals, onApproveTool, onRejectTool, onSuggestionClick, showSuggestions = true, workspaceId, workspaceArtifactDisplay = "full" }: MessageContentProps) {
  const content = useMemo(() => textFromMessage(message), [message]);
  const citations = useMemo(() => citationsFromMessage(message), [message]);
  const isAssistant = message.role === "assistant";
  const renderableParts = useMemo(() => renderablePartsFromMessage(message).filter((part) => (part.type !== "text" || part.content.trim().length > 0) && !chatTodoListFromToolPart(part)), [message]);
  const partGroups = useMemo(
    () =>
      groupWorkPhaseParts(renderableParts, {
        isStandalonePart: toolPartHasStandaloneRendering,
      }),
    [renderableParts],
  );
  const stepSequenceByPartIndex = useMemo(() => {
    const sequenceByIndex = new Map<number, number>();
    let sequence = 1;
    renderableParts.forEach((part, partIndex) => {
      if (part.type !== "reasoning" && part.type !== "tool-call" && part.type !== "tool-result") {
        return;
      }
      sequenceByIndex.set(partIndex, sequence);
      sequence += 1;
    });
    return sequenceByIndex;
  }, [renderableParts]);
  const { approvalByPartIndex, standaloneApprovals } = useMemo(() => {
    const approvalByIndex = new Map<number, PendingToolApproval>();
    const matchedApprovalIds = new Set<string>();
    const findUnmatchedApproval = (pendingApprovals: PendingToolApproval[], part: (typeof renderableParts)[number]): PendingToolApproval | undefined => pendingApprovals.find((item) => !matchedApprovalIds.has(item.invocationId) && toolPartMatchesApproval(part, item));
    if (message.status === "streaming") {
      for (let partIndex = renderableParts.length - 1; partIndex >= 0; partIndex -= 1) {
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
      standaloneApprovals: message.status === "streaming" ? pendingApprovals.filter((approval) => !matchedApprovalIds.has(approval.invocationId)) : [],
    };
  }, [message.status, pendingApprovals, renderableParts]);
  if (isEditing) {
    return <RichEditor value={editingContent} onChange={onEditingContentChange} onSave={onSaveEdit} onCancel={onCancelEdit} disabled={isSaving} />;
  }
  if (!isAssistant) {
    const fileParts = renderableParts.filter((part) => part.type === "file");
    if (fileParts.length === 0) return content;
    return (
      <div className="flex flex-col gap-2">
        {content ? <div>{content}</div> : null}
        {fileParts.map((part, partIndex) => {
          const key = `${message.id}-${part.type}-${partIndex}`;
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
          return workspaceArtifactDisplay === "summary" ? <CodeWorkspaceArtifactSummary key={key} artifact={fileArtifact} /> : <CodeWorkspaceArtifactCard key={key} artifact={fileArtifact} />;
        })}
      </div>
    );
  }
  const renderAssistantPart = (part: ChatMessagePart, partIndex: number): React.ReactNode => {
    const key = `${message.id}-${part.type}-${partIndex}`;
    if (part.type === "impact") return null;
    if (part.type === "suggestions") {
      if (!showSuggestions) return null;
      return <SuggestionsPart key={key} part={part} onSuggestionClick={onSuggestionClick} />;
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
      return workspaceArtifactDisplay === "summary" ? <CodeWorkspaceArtifactSummary key={key} artifact={fileArtifact} /> : <CodeWorkspaceArtifactCard key={key} artifact={fileArtifact} workspaceId={workspaceId} />;
    }
    if (part.type === "tool-call" || part.type === "tool-result") {
      return <ToolPartCard key={key} part={part} sequence={stepSequenceByPartIndex.get(partIndex) ?? 1} messageStatus={message.status} approval={approvalByPartIndex.get(partIndex)} workspaceId={workspaceId} workspaceArtifactDisplay={workspaceArtifactDisplay} onApprove={onApproveTool} onReject={onRejectTool} />;
    }
    return <ChatMarkdown key={key}>{part.content}</ChatMarkdown>;
  };
  return (
    <div className="flex flex-col gap-2">
      {citations.length > 0 ? <CitationBlock citations={citations} workspaceId={workspaceId} /> : null}
      {standaloneApprovals.length > 0 ? standaloneApprovals.map((approval, approvalIndex) => <PendingApprovalCard key={approval.invocationId} pendingApproval={approval} sequence={approvalIndex + 1} onApprove={onApproveTool} onReject={onRejectTool} />) : null}
      {renderableParts.length > 0 ? (
        partGroups.map((group) => {
          if (group.type === "part") {
            return renderAssistantPart(group.part, group.partIndex);
          }
          const firstPartIndex = group.parts[0].partIndex;
          return (
            <WorkPhase key={`${message.id}-work-phase-${firstPartIndex}`} parts={group.parts} sequence={stepSequenceByPartIndex.get(firstPartIndex) ?? 1} hasVisibleResponseAfter={group.hasVisibleResponseAfter} hasPendingApproval={group.parts.some(({ partIndex }) => approvalByPartIndex.has(partIndex))} messageStatus={message.status}>
              {group.parts.map(({ part, partIndex }) => renderAssistantPart(part, partIndex))}
            </WorkPhase>
          );
        })
      ) : standaloneApprovals.length === 0 ? (
        content ? (
          <ChatMarkdown>{content}</ChatMarkdown>
        ) : isAnimating ? (
          <StreamingThinking />
        ) : null
      ) : null}
    </div>
  );
}, areMessageContentPropsEqual);
