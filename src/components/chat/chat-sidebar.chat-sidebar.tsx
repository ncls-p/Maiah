"use client";

import { FolderPlusIcon,MessageSquareIcon,PanelLeftOpenIcon,PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo,useState } from "react";

import type { ChatConversation } from "@/components/chat/chat-types";
import { SidebarFooter,SidebarHeader } from "@/components/sidebar-chrome";
import { Button } from "@/components/ui/button";
import { Tooltip,TooltipContent,TooltipTrigger } from "@/components/ui/tooltip";
import { useConversationFolderVisibility } from "@/hooks/use-conversation-folder-visibility";
import { cn } from "@/lib/utils";
import { buildMenuGroups } from "@/modules/navigation/sidebar-config";
import { ChatSidebarView } from "./chat-sidebar.chat-sidebar.view";
import { ConversationItem } from "./chat-sidebar.conversation-item";
import { BUTTON_TYPE,ChatSidebarProps,GHOST_VARIANT } from "./chat-sidebar.default-workspace-nav-open";

export function useChatSidebarController({ agents, conversations, conversationFolders, activeConversationId, loading, searchQuery = "", searchResults = [], searching = false, searchError = false, hasMoreSearchResults = false, loadingMoreSearchResults = false, onSearchQueryChange, onRetrySearch, onLoadMoreSearchResults, onSelectConversation, onNewConversation, onRenameConversation, onDeleteConversation, onCreateConversationFolder, onRenameConversationFolder, onDeleteConversationFolder, onToggleConversationPin, onReorderConversations, hasMoreConversations, loadingMoreConversations, onLoadMoreConversations, collapsed, onCollapsedChange, className, shell, workspaceId, readOnly = false, showWorkspaceNavigation = true, footerContent }: ChatSidebarProps) {
  const t = useTranslations("chat.sidebar");
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const { openFolderIds, setFolderOpen } = useConversationFolderVisibility({
    workspaceId,
    userId: shell?.currentUserId,
  });
  const [draggingConversationId, setDraggingConversationId] = useState<string | null>(null);
  const agentNameById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents]);
  const navGroups = useMemo(() => (shell ? buildMenuGroups(shell) : []), [shell]);
  const searchActive = searchQuery.trim().length > 0;
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aPinned = a.pinnedAt ? 0 : 1;
      const bPinned = b.pinnedAt ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;

      const aHasManualOrder = a.sidebarOrder !== null && a.sidebarOrder !== undefined;
      const bHasManualOrder = b.sidebarOrder !== null && b.sidebarOrder !== undefined;
      if (aHasManualOrder !== bHasManualOrder) {
        return aHasManualOrder ? 1 : -1;
      }

      if (aHasManualOrder && bHasManualOrder && a.sidebarOrder !== b.sidebarOrder) {
        return (a.sidebarOrder ?? 0) - (b.sidebarOrder ?? 0);
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations]);
  const pinnedConversations = useMemo(() => sortedConversations.filter((conversation) => conversation.pinnedAt), [sortedConversations]);
  const unpinnedConversations = useMemo(() => sortedConversations.filter((conversation) => !conversation.pinnedAt), [sortedConversations]);
  const topLevelConversations = useMemo(() => unpinnedConversations.filter((conversation) => !conversation.folderId), [unpinnedConversations]);
  const folderSections = useMemo(() => {
    return conversationFolders.map((folder) => ({
      folder,
      conversations: unpinnedConversations.filter((conversation) => conversation.folderId === folder.id),
    }));
  }, [conversationFolders, unpinnedConversations]);
  function orderedIdsWithInsertion(items: ChatConversation[], draggedId: string, beforeId?: string) {
    const ids = items.map((conversation) => conversation.id).filter((id) => id !== draggedId);
    const insertionIndex = beforeId ? ids.indexOf(beforeId) : -1;
    ids.splice(insertionIndex >= 0 ? insertionIndex : ids.length, 0, draggedId);
    return ids;
  }

  function reorderDraggedConversation({ folderId, pinned, beforeId }: { folderId: string | null; pinned: boolean; beforeId?: string }) {
    if (!draggingConversationId || !onReorderConversations) return;
    if (beforeId === draggingConversationId) {
      setDraggingConversationId(null);
      return;
    }
    const destinationItems = pinned ? pinnedConversations : folderId ? (folderSections.find((section) => section.folder.id === folderId)?.conversations ?? []) : topLevelConversations;
    onReorderConversations({
      conversationIds: orderedIdsWithInsertion(destinationItems, draggingConversationId, beforeId),
      folderId,
      pinned,
    });
    setDraggingConversationId(null);
  }

  function handleConversationDrop(event: React.DragEvent<HTMLDivElement>, conversation: ChatConversation) {
    event.preventDefault();
    event.stopPropagation();
    reorderDraggedConversation({
      folderId: conversation.pinnedAt ? null : (conversation.folderId ?? null),
      pinned: Boolean(conversation.pinnedAt),
      beforeId: conversation.id,
    });
  }

  function conversationGroup(conversation: ChatConversation) {
    const pinned = Boolean(conversation.pinnedAt);
    const folderId = pinned ? null : (conversation.folderId ?? null);
    const items = pinned ? pinnedConversations : folderId ? (folderSections.find((section) => section.folder.id === folderId)?.conversations ?? []) : topLevelConversations;
    return { folderId, pinned, items };
  }

  function canMoveConversation(conversation: ChatConversation, delta: -1 | 1) {
    if (!onReorderConversations) return false;
    const { items } = conversationGroup(conversation);
    const currentIndex = items.findIndex((item) => item.id === conversation.id);
    const nextIndex = currentIndex + delta;
    return currentIndex >= 0 && nextIndex >= 0 && nextIndex < items.length;
  }

  function moveConversation(conversation: ChatConversation, delta: -1 | 1) {
    if (!onReorderConversations) return;
    const { folderId, pinned, items } = conversationGroup(conversation);
    const currentIndex = items.findIndex((item) => item.id === conversation.id);
    const nextIndex = currentIndex + delta;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return;

    const conversationIds = items.map((item) => item.id);
    const [conversationId] = conversationIds.splice(currentIndex, 1);
    if (!conversationId) return;
    conversationIds.splice(nextIndex, 0, conversationId);
    onReorderConversations({ conversationIds, folderId, pinned });
  }

  function startFolderCreate() {
    setCreatingFolder(true);
    setNewFolderName("");
  }

  function saveNewFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    onCreateConversationFolder?.(name);
    setCreatingFolder(false);
    setNewFolderName("");
  }

  function renderHistoryActions() {
    if (readOnly || !onCreateConversationFolder) return null;

    return (
      <div role="toolbar" aria-label={t("historyActions")} className="flex min-h-10 shrink-0 items-center justify-end gap-1">
        <Button type={BUTTON_TYPE} size="icon-sm" variant={GHOST_VARIANT} className="size-10 rounded-xl text-muted-foreground transition-[background-color,color,scale] active:scale-[0.96]" aria-label={t("createFolder")} title={t("createFolder")} onClick={startFolderCreate}>
          <FolderPlusIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  function renderConversation(conversation: ChatConversation, options?: { searchResult?: boolean }) {
    const isActive = activeConversationId === conversation.id;
    const isEditing = editingConversationId === conversation.id;
    const agentName = agentNameById.get(conversation.agentId) ?? t("assistant");

    return (
      <ConversationItem
        key={conversation.id}
        conversation={conversation}
        isActive={isActive}
        isEditing={isEditing}
        editingTitle={isEditing ? editingTitle : ""}
        agentName={agentName}
        onSelect={() => onSelectConversation(conversation.id, conversation.agentId)}
        onRename={(title) => {
          onRenameConversation?.(conversation.id, title);
          setEditingConversationId(null);
        }}
        onDelete={() => onDeleteConversation?.(conversation.id)}
        onEditStart={() => {
          setEditingConversationId(conversation.id);
          setEditingTitle(conversation.title);
        }}
        onEditChange={setEditingTitle}
        onEditCancel={() => setEditingConversationId(null)}
        onTogglePin={() => onToggleConversationPin?.(conversation.id, !conversation.pinnedAt)}
        onMoveUp={() => moveConversation(conversation, -1)}
        onMoveDown={() => moveConversation(conversation, 1)}
        canMoveUp={canMoveConversation(conversation, -1)}
        canMoveDown={canMoveConversation(conversation, 1)}
        onDragStart={(event) => {
          setDraggingConversationId(conversation.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", conversation.id);
        }}
        onDragEnd={() => setDraggingConversationId(null)}
        onDropBefore={(event) => handleConversationDrop(event, conversation)}
        isDragging={draggingConversationId === conversation.id}
        searchMatch={options?.searchResult ? conversation.searchMatch : undefined}
        readOnly={readOnly}
      />
    );
  }

  if (collapsed) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col items-center gap-1 bg-transparent", className)}>
        <SidebarHeader
          contextLabel={t("conversations")}
          collapsed
          action={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type={BUTTON_TYPE} size="icon" variant={GHOST_VARIANT} aria-label={t("expandSidebar")} onClick={() => onCollapsedChange?.(false)} className="size-10 rounded-xl">
                  <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("expandSidebar")}</TooltipContent>
            </Tooltip>
          }
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type={BUTTON_TYPE} size="icon" variant={GHOST_VARIANT} aria-label={t("newConversation")} onClick={onNewConversation} className="size-10 rounded-xl">
              <PlusIcon className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("newConversation")}</TooltipContent>
        </Tooltip>
        <div className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
          {sortedConversations.slice(0, 10).map((conversation) => (
            <Tooltip key={conversation.id}>
              <TooltipTrigger asChild>
                <Button type={BUTTON_TYPE} size="icon" variant={activeConversationId === conversation.id ? "secondary" : "ghost"} aria-label={conversation.title} onClick={() => onSelectConversation(conversation.id)} className={cn("size-10 rounded-xl transition-[background-color,color]", activeConversationId === conversation.id && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                  <MessageSquareIcon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{conversation.title}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <SidebarFooter displayName={shell?.displayName} collapsed />
      </div>
    );
  }

  return {
    kind: "ready",
    className,
    conversationFolders,
    conversations,
    creatingFolder,
    editingFolderId,
    editingFolderName,
    folderSections,
    footerContent,
    hasMoreConversations,
    hasMoreSearchResults,
    loading,
    loadingMoreConversations,
    loadingMoreSearchResults,
    navGroups,
    newFolderName,
    onCollapsedChange,
    onDeleteConversationFolder,
    onLoadMoreConversations,
    onLoadMoreSearchResults,
    onNewConversation,
    onRenameConversationFolder,
    onRetrySearch,
    onSearchQueryChange,
    openFolderIds,
    pinnedConversations,
    readOnly,
    renderConversation,
    renderHistoryActions,
    reorderDraggedConversation,
    saveNewFolder,
    searchActive,
    searchError,
    searchQuery,
    searchResults,
    searching,
    setCreatingFolder,
    setEditingFolderId,
    setEditingFolderName,
    setFolderOpen,
    setNewFolderName,
    shell,
    showWorkspaceNavigation,
    t,
    topLevelConversations,
  } as const;
}

export function ChatSidebar(...args: Parameters<typeof useChatSidebarController>) {
  const model = useChatSidebarController(...args);
  if (!("kind" in model)) return model;
  return <ChatSidebarView model={model} />;
}
