import type {
  ChatConversation,
  ChatConversationFolder,
} from "@/components/chat/chat-types";
import type { ChatSidebarProps } from "./chat-sidebar.default-workspace-nav-open";

export function sortConversations(
  conversations: ChatConversation[],
): ChatConversation[] {
  return [...conversations].sort((a, b) => {
    const aPinned = a.pinnedAt ? 0 : 1;
    const bPinned = b.pinnedAt ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;

    const aHasManualOrder =
      a.sidebarOrder !== null && a.sidebarOrder !== undefined;
    const bHasManualOrder =
      b.sidebarOrder !== null && b.sidebarOrder !== undefined;
    if (aHasManualOrder !== bHasManualOrder) {
      return aHasManualOrder ? 1 : -1;
    }

    if (
      aHasManualOrder &&
      bHasManualOrder &&
      a.sidebarOrder !== b.sidebarOrder
    ) {
      return (a.sidebarOrder ?? 0) - (b.sidebarOrder ?? 0);
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export interface ConversationFolderSection {
  folder: ChatConversationFolder;
  conversations: ChatConversation[];
}

export interface ConversationBuckets {
  pinned: ChatConversation[];
  topLevel: ChatConversation[];
  folders: ConversationFolderSection[];
}

export function deriveConversationBuckets(
  sorted: ChatConversation[],
  conversationFolders: ChatConversationFolder[],
): ConversationBuckets {
  const unpinned = sorted.filter((conversation) => !conversation.pinnedAt);
  return {
    pinned: sorted.filter((conversation) => conversation.pinnedAt),
    topLevel: unpinned.filter((conversation) => !conversation.folderId),
    folders: conversationFolders.map((folder) => ({
      folder,
      conversations: unpinned.filter(
        (conversation) => conversation.folderId === folder.id,
      ),
    })),
  };
}

export function orderedIdsWithInsertion(
  items: ChatConversation[],
  draggedId: string,
  beforeId?: string,
): string[] {
  const ids = items
    .map((conversation) => conversation.id)
    .filter((id) => id !== draggedId);
  const insertionIndex = beforeId ? ids.indexOf(beforeId) : -1;
  ids.splice(insertionIndex >= 0 ? insertionIndex : ids.length, 0, draggedId);
  return ids;
}

export function conversationItems(
  conversation: ChatConversation,
  buckets: ConversationBuckets,
): ChatConversation[] {
  const pinned = Boolean(conversation.pinnedAt);
  const folderId = pinned ? null : (conversation.folderId ?? null);
  return pinned
    ? buckets.pinned
    : folderId
      ? (buckets.folders.find((section) => section.folder.id === folderId)
          ?.conversations ?? [])
      : buckets.topLevel;
}

export function canMoveConversation(
  conversation: ChatConversation,
  buckets: ConversationBuckets,
  reorderAvailable: boolean,
  delta: -1 | 1,
): boolean {
  if (!reorderAvailable) return false;
  const items = conversationItems(conversation, buckets);
  const currentIndex = items.findIndex((item) => item.id === conversation.id);
  const nextIndex = currentIndex + delta;
  return currentIndex >= 0 && nextIndex >= 0 && nextIndex < items.length;
}

export function moveConversation(
  conversation: ChatConversation,
  buckets: ConversationBuckets,
  delta: -1 | 1,
  onReorderConversations: ChatSidebarProps["onReorderConversations"],
): void {
  if (!onReorderConversations) return;
  const pinned = Boolean(conversation.pinnedAt);
  const folderId = pinned ? null : (conversation.folderId ?? null);
  const items = conversationItems(conversation, buckets);
  const currentIndex = items.findIndex((item) => item.id === conversation.id);
  const nextIndex = currentIndex + delta;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return;

  const conversationIds = items.map((item) => item.id);
  const [conversationId] = conversationIds.splice(currentIndex, 1);
  if (!conversationId) return;
  conversationIds.splice(nextIndex, 0, conversationId);
  onReorderConversations({ conversationIds, folderId, pinned });
}
