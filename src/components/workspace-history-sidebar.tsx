"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { MessageSquareWarningIcon, PanelLeftOpenIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { ChatSidebar } from "@/components/chat/chat-sidebar";
import type {
  ChatAgent,
  ChatConversation,
  ChatConversationFolder,
} from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
  SidebarHeader,
  WorkspaceStatusFooter,
} from "@/components/sidebar-chrome";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { fetchJson } from "@/lib/api-client";
import {
  DEFAULT_APP_SIDEBAR_WIDTH,
  MAX_APP_SIDEBAR_WIDTH,
  MIN_APP_SIDEBAR_WIDTH,
  getStoredAppSidebarWidth,
  setStoredAppSidebarWidth,
  subscribeAppSidebarWidth,
} from "@/lib/sidebar-layout";
import type { WorkspaceShellState } from "@/lib/workspace-nav";

type ConversationPayload =
  | ChatConversation[]
  | {
      conversations?: ChatConversation[];
      folders?: ChatConversationFolder[];
    };

type AgentPayload = ChatAgent[] | { agents?: ChatAgent[] };

function normalizeConversations(payload: ConversationPayload) {
  if (Array.isArray(payload)) {
    return { conversations: payload, folders: [] };
  }
  return {
    conversations: payload.conversations ?? [],
    folders: payload.folders ?? [],
  };
}

function useWorkspaceHistory() {
  const { workspaceId } = useWorkspace();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [folders, setFolders] = useState<ChatConversationFolder[]>([]);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatConversation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({
      workspaceId,
      limit: "50",
      includeMeta: "true",
    });
    const agentParams = new URLSearchParams({
      workspaceId,
      includeModelMeta: "true",
    });

    void Promise.all([
      fetchJson<ConversationPayload>(
        `/api/workspace/conversations?${params.toString()}`,
        { signal: controller.signal },
      ),
      fetchJson<AgentPayload>(
        `/api/workspace/agents?${agentParams.toString()}`,
        { signal: controller.signal },
      ),
    ])
      .then(([conversationPayload, agentPayload]) => {
        if (!active) return;
        const normalized = normalizeConversations(conversationPayload);
        setConversations(normalized.conversations);
        setFolders(normalized.folders);
        setAgents(
          Array.isArray(agentPayload)
            ? agentPayload
            : (agentPayload.agents ?? []),
        );
        setResolvedWorkspaceId(workspaceId);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (active) {
          setLoadError(true);
          setResolvedWorkspaceId(workspaceId);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [revision, workspaceId]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!workspaceId || !normalizedQuery) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        workspaceId,
        limit: "50",
        includeMeta: "true",
        q: normalizedQuery,
      });
      setSearching(true);
      setSearchError(false);
      void fetchJson<ConversationPayload>(
        `/api/workspace/conversations?${params.toString()}`,
        { signal: controller.signal },
      )
        .then((payload) => {
          if (!active) return;
          setSearchResults(normalizeConversations(payload).conversations);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          if (active) setSearchError(true);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 240);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, revision, workspaceId]);

  return {
    agents,
    conversations,
    folders,
    loading: loading || resolvedWorkspaceId !== workspaceId,
    loadError,
    query,
    searchResults: query.trim() ? searchResults : [],
    searching: Boolean(query.trim()) && searching,
    searchError: Boolean(query.trim()) && searchError,
    setQuery: (nextQuery: string) => {
      setQuery(nextQuery);
      setSearchResults([]);
      setSearching(false);
      setSearchError(false);
    },
    retry: () => {
      setLoading(true);
      setLoadError(false);
      setResolvedWorkspaceId(null);
      setSearchError(false);
      setRevision((current) => current + 1);
    },
  };
}

function WorkspaceHistoryContent({
  shell,
  onNavigate,
}: {
  shell: WorkspaceShellState;
  onNavigate?: () => void;
}) {
  const t = useTranslations("chat.sidebar");
  const router = useRouter();
  const { workspaceId, workspaces } = useWorkspace();
  const history = useWorkspaceHistory();
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === workspaceId,
  );

  const openConversation = useCallback(
    (conversationId: string, agentId?: string | null) => {
      const params = new URLSearchParams({ conversationId });
      if (agentId) params.set("agentId", agentId);
      router.push(`/chat?${params.toString()}`);
      onNavigate?.();
    },
    [onNavigate, router],
  );

  if (history.loadError) {
    return (
      <div className="flex h-full flex-col">
        <SidebarHeader
          contextLabel={t("conversations")}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                router.push("/chat");
                onNavigate?.();
              }}
            >
              {t("new")}
            </Button>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <MessageSquareWarningIcon className="size-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">{t("historyLoadErrorTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("historyLoadErrorDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={history.retry}
          >
            {t("retrySearch")}
          </Button>
        </div>
        <WorkspaceStatusFooter
          name={activeWorkspace?.name ?? "Maiah"}
          context={activeWorkspace?.organizationName}
        />
      </div>
    );
  }

  return (
    <ChatSidebar
      agents={history.agents}
      conversations={history.conversations}
      conversationFolders={history.folders}
      activeConversationId={null}
      loading={history.loading}
      searchQuery={history.query}
      searchResults={history.searchResults}
      searching={history.searching}
      searchError={history.searchError}
      onSearchQueryChange={history.setQuery}
      onRetrySearch={history.retry}
      onSelectConversation={openConversation}
      onNewConversation={() => {
        router.push("/chat");
        onNavigate?.();
      }}
      readOnly
      showWorkspaceNavigation={false}
      shell={shell}
      workspaceId={workspaceId}
      className="workspace-history-panel"
      footerContent={
        <WorkspaceStatusFooter
          name={activeWorkspace?.name ?? "Maiah"}
          context={activeWorkspace?.organizationName}
        />
      }
    />
  );
}

export function WorkspaceHistorySidebar({
  shell,
}: {
  shell: WorkspaceShellState;
}) {
  const tShell = useTranslations("shell");
  const width = useSyncExternalStore(
    subscribeAppSidebarWidth,
    getStoredAppSidebarWidth,
    () => DEFAULT_APP_SIDEBAR_WIDTH,
  );
  const [resizing, setResizing] = useState(false);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onPointerMove(moveEvent: PointerEvent) {
      setStoredAppSidebarWidth(startWidth + moveEvent.clientX - startX);
    }

    function onPointerUp() {
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  }

  return (
    <aside
      data-slot="workspace-history-sidebar"
      className="relative hidden h-full shrink-0 border-r border-sidebar-border/65 bg-sidebar/92 text-sidebar-foreground backdrop-blur-xl md:flex md:flex-col"
      style={{ width: `${width}px` }}
    >
      <WorkspaceHistoryContent shell={shell} />
      <div
        role="separator"
        aria-label={tShell("resizeNavigation")}
        aria-orientation="vertical"
        aria-valuemin={MIN_APP_SIDEBAR_WIDTH}
        aria-valuemax={MAX_APP_SIDEBAR_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        className="group absolute inset-y-0 right-0 z-20 w-3 translate-x-1.5 cursor-col-resize outline-none"
        onPointerDown={startResize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setStoredAppSidebarWidth(width - 12);
          if (event.key === "ArrowRight") setStoredAppSidebarWidth(width + 12);
        }}
      >
        <div
          className={`mx-auto h-full w-px transition-colors ${
            resizing
              ? "bg-ring"
              : "bg-transparent group-hover:bg-border group-focus-visible:bg-ring"
          }`}
        />
      </div>
    </aside>
  );
}

export function WorkspaceHistoryMobileTrigger({
  shell,
}: {
  shell: WorkspaceShellState;
}) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 md:hidden"
          aria-label={t("openConversations")}
        >
          <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100vw-1rem,20rem)] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{t("conversations")}</SheetTitle>
        </SheetHeader>
        <WorkspaceHistoryContent
          shell={shell}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
