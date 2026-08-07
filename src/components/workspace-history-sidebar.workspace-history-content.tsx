"use client";

import { MessageSquareWarningIcon,PanelLeftCloseIcon,PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback,useState } from "react";

import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import { SidebarHeader,WorkspaceStatusFooter } from "@/components/sidebar-chrome";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import type { WorkspaceShellState } from "@/lib/workspace-nav";
import { useWorkspaceHistory } from "./workspace-history-sidebar.use-workspace-history";

export function WorkspaceHistoryContent({ shell, onNavigate, onCollapsedChange }: { shell: WorkspaceShellState; onNavigate?: () => void; onCollapsedChange?: (collapsed: boolean) => void }) {
  const t = useTranslations("chat.sidebar");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId, workspaces } = useWorkspace();
  const history = useWorkspaceHistory();
  const [pendingDelete, setPendingDelete] = useState<{ kind: "conversation"; id: string; name: string } | { kind: "folder"; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);

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
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                className="size-10 rounded-xl"
                onClick={() => {
                  router.push("/chat");
                  onNavigate?.();
                }}
                aria-label={t("newConversation")}
              >
                <PlusIcon className="size-4" aria-hidden="true" />
              </Button>
              {onCollapsedChange ? (
                <Button type="button" size="icon" variant="ghost" className="size-10 rounded-xl active:scale-[0.96]" onClick={() => onCollapsedChange(true)} aria-label={t("collapseSidebar")}>
                  <PanelLeftCloseIcon className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <MessageSquareWarningIcon className="size-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">{t("historyLoadErrorTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("historyLoadErrorDescription")}</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={history.retry}>
            {t("retrySearch")}
          </Button>
        </div>
        <WorkspaceStatusFooter name={activeWorkspace?.name ?? "Maiah"} context={activeWorkspace?.organizationName} />
      </div>
    );
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const deleted = pendingDelete.kind === "folder" ? await history.deleteFolder(pendingDelete.id) : await history.deleteConversation(pendingDelete.id);
    setDeleting(false);
    if (deleted) setPendingDelete(null);
  }

  return (
    <>
      <ChatSidebar
        agents={history.agents}
        conversations={history.conversations}
        conversationFolders={history.folders}
        activeConversationId={searchParams.get("conversationId")}
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
        onRenameConversation={(conversationId, title) => void history.renameConversation(conversationId, title)}
        onDeleteConversation={(conversationId) => {
          const conversation = history.conversations.find((item) => item.id === conversationId);
          if (conversation) {
            setPendingDelete({
              kind: "conversation",
              id: conversation.id,
              name: conversation.title,
            });
          }
        }}
        onCreateConversationFolder={(name) => void history.createFolder(name)}
        onRenameConversationFolder={(folderId, name) => void history.renameFolder(folderId, name)}
        onDeleteConversationFolder={(folderId) => {
          const folder = history.folders.find((item) => item.id === folderId);
          if (folder) {
            setPendingDelete({
              kind: "folder",
              id: folder.id,
              name: folder.name,
            });
          }
        }}
        onToggleConversationPin={(conversationId, pinned) => void history.togglePin(conversationId, pinned)}
        onReorderConversations={(input) => void history.reorderConversations(input)}
        showWorkspaceNavigation={false}
        shell={shell}
        workspaceId={workspaceId}
        className="workspace-history-panel"
        footerContent={<WorkspaceStatusFooter name={activeWorkspace?.name ?? "Maiah"} context={activeWorkspace?.organizationName} />}
        onCollapsedChange={onCollapsedChange}
      />
      <DestructiveConfirmationDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === "folder" ? t("deleteFolderTitle") : t("deleteConversationTitle")}
        description={
          pendingDelete?.kind === "folder"
            ? t("deleteFolderDescription", {
                name: pendingDelete?.name ?? "",
              })
            : t("deleteConversationDescription", {
                name: pendingDelete?.name ?? "",
              })
        }
        cancelLabel={t("deleteCancel")}
        confirmLabel={deleting ? t("deleting") : t("delete")}
        busy={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
