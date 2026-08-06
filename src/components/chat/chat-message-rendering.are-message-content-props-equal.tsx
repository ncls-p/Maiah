"use client";

import { MessageContentProps } from "./chat-message-rendering.message-content-props";

export function areMessageContentPropsEqual(previous: Readonly<MessageContentProps>, next: Readonly<MessageContentProps>) {
  return previous.message === next.message && previous.showSuggestions === next.showSuggestions && previous.workspaceId === next.workspaceId && previous.workspaceArtifactDisplay === next.workspaceArtifactDisplay && previous.isEditing === next.isEditing && previous.editingContent === next.editingContent && previous.isSaving === next.isSaving && previous.isAnimating === next.isAnimating && previous.pendingApprovals === next.pendingApprovals;
}
