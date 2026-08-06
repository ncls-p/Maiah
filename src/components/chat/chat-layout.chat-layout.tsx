"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";

import { useWorkspaceShell } from "@/components/app-shell";
import { ChatAgentSelector } from "@/components/chat/chat-agent-selector";
import { ChatComposerImpact } from "@/components/chat/chat-composer-impact";
import { WorkspaceStatusFooter } from "@/components/sidebar-chrome";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  DEFAULT_APP_SIDEBAR_OPEN,
  DEFAULT_APP_SIDEBAR_WIDTH,
  getStoredAppSidebarOpen,
  getStoredAppSidebarWidth,
  setStoredAppSidebarOpen,
  setStoredAppSidebarWidth,
  subscribeAppSidebarOpen,
  subscribeAppSidebarWidth,
} from "@/lib/sidebar-layout";
import {
  ChatLayoutProps,
  ChatSidebarCollapsedChangeHandler,
} from "./chat-layout.chat-composer-controls-context";
import { ChatLayoutView } from "./chat-layout.chat-layout.view";

export function useChatLayoutController(props: ChatLayoutProps) {
  const t = useTranslations("chat");
  const shell = useWorkspaceShell();
  const { workspaceId, workspaces } = useWorkspace();
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === workspaceId,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const sidebarOpen = useSyncExternalStore(
    subscribeAppSidebarOpen,
    getStoredAppSidebarOpen,
    () => DEFAULT_APP_SIDEBAR_OPEN,
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const sidebarWidth = useSyncExternalStore(
    subscribeAppSidebarWidth,
    getStoredAppSidebarWidth,
    () => DEFAULT_APP_SIDEBAR_WIDTH,
  );

  function updateSidebarOpen({ open }: { open: boolean }) {
    setStoredAppSidebarOpen(open);
  }

  function startSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!sidebarOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    setResizingSidebar(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onPointerMove(moveEvent: PointerEvent) {
      setStoredAppSidebarWidth(startWidth + moveEvent.clientX - startX);
    }
    function onPointerUp() {
      setResizingSidebar(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    }
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  }

  const sidebarProps = {
    agents: props.agents,
    conversations: props.conversations,
    conversationFolders: props.conversationFolders,
    activeConversationId: props.activeConversationId,
    loading: props.loadingSidebar,
    searchQuery: props.conversationSearchQuery,
    searchResults: props.conversationSearchResults,
    searching: props.searchingConversations,
    searchError: props.conversationSearchError,
    hasMoreSearchResults: props.hasMoreConversationSearchResults,
    loadingMoreSearchResults: props.loadingMoreConversationSearchResults,
    onSearchQueryChange: props.onConversationSearchQueryChange,
    onRetrySearch: props.onRetryConversationSearch,
    onLoadMoreSearchResults: props.onLoadMoreConversationSearchResults,
    onSelectConversation: props.onSelectConversation,
    onNewConversation: props.onNewConversation,
    onRenameConversation: props.onRenameConversation,
    onDeleteConversation: props.onDeleteConversation,
    onCreateConversationFolder: props.onCreateConversationFolder,
    onRenameConversationFolder: props.onRenameConversationFolder,
    onDeleteConversationFolder: props.onDeleteConversationFolder,
    onToggleConversationPin: props.onToggleConversationPin,
    onReorderConversations: props.onReorderConversations,
    hasMoreConversations: props.hasMoreConversations,
    loadingMoreConversations: props.loadingMoreConversations,
    onLoadMoreConversations: props.onLoadMoreConversations,
    collapsed: false,
    onCollapsedChange: undefined,
    shell,
    workspaceId,
    showWorkspaceNavigation: false,
    footerContent: (
      <WorkspaceStatusFooter
        name={activeWorkspace?.name ?? "Maiah"}
        context={activeWorkspace?.organizationName}
      />
    ),
  };
  const desktopSidebarProps = {
    ...sidebarProps,
    onCollapsedChange: ((collapsed) =>
      updateSidebarOpen({
        open: !collapsed,
      })) satisfies ChatSidebarCollapsedChangeHandler,
  };
  const mobileSidebarProps = {
    ...sidebarProps,
    onSelectConversation: (
      conversationId: string,
      conversationAgentId?: string | null,
    ) => {
      props.onSelectConversation(conversationId, conversationAgentId);
      setMobileSidebarOpen(false);
    },
  };
  const hasImpact = Boolean(
    props.conversationImpact &&
    (props.conversationImpact.cost !== null ||
      props.conversationImpact.energyKwh !== null),
  );
  const composerControls = {
    primary: (
      <ChatAgentSelector
        agents={props.agents}
        selectedAgent={props.selectedAgent}
        activeConversationId={props.activeConversationId}
        workspaceId={workspaceId}
        organizationDefaultAgentId={props.organizationDefaultAgentId}
        userDefaultAgentId={props.userDefaultAgentId}
        canChat={props.canChat}
        canCreateAgent={props.canCreateAgent ?? false}
        onSelectAgent={props.onSelectAgent}
        onSetUserDefaultAgent={props.onSetUserDefaultAgent}
      />
    ),
    secondary:
      hasImpact && props.conversationImpact ? (
        <ChatComposerImpact impact={props.conversationImpact} />
      ) : null,
  };

  return {
    kind: "ready",
    adjustSidebarWidth: (delta: number) =>
      setStoredAppSidebarWidth(sidebarWidth + delta),
    canChat: props.canChat,
    canRunSetup: props.canRunSetup ?? false,
    children: props.children,
    composerControls,
    desktopSidebarProps,
    mobileSidebarOpen,
    mobileSidebarProps,
    onNewConversation: props.onNewConversation,
    onSetupComplete: props.onSetupComplete,
    resizingSidebar,
    selectedAgentId: props.selectedAgentId,
    setMobileSidebarOpen,
    setSetupOpen,
    setupOpen,
    shell,
    sidebarOpen,
    sidebarWidth,
    startSidebarResize,
    t,
    updateSidebarOpen,
  } as const;
}

export function ChatLayout(
  ...args: Parameters<typeof useChatLayoutController>
) {
  const model = useChatLayoutController(...args);
  if (!("kind" in model)) return model;
  return <ChatLayoutView model={model} />;
}
