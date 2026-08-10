import {
  ChevronDownIcon,
  FolderIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
import {
  BUTTON_TYPE,
  GHOST_VARIANT,
} from "./chat-sidebar.default-workspace-nav-open";
export function ChatSidebarListsBranch1({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {
    editingFolderId,
    editingFolderName,
    folderSections,
    hasMoreConversations,
    loadingMoreConversations,
    onDeleteConversationFolder,
    onLoadMoreConversations,
    onRenameConversationFolder,
    openFolderIds,
    pinnedConversations,
    readOnly,
    renderConversation,
    reorderDraggedConversation,
    setEditingFolderId,
    setEditingFolderName,
    setFolderOpen,
    t,
    topLevelConversations,
  } = model;
  return (
    <div className="flex flex-col gap-3">
      {pinnedConversations.length > 0 ? (
        <section
          className="flex flex-col gap-px"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            reorderDraggedConversation({
              folderId: null,
              pinned: true,
            });
          }}
        >
          <div className="flex items-center gap-1 px-2 pb-1 text-[11px] font-medium text-muted-foreground">
            <PinIcon className="size-3" aria-hidden="true" />
            {t("pinned")}
          </div>
          {pinnedConversations.map((conversation) =>
            renderConversation(conversation),
          )}
        </section>
      ) : null}

      {folderSections.map(({ folder, conversations: folderConversations }) => {
        const open = openFolderIds.has(folder.id);
        const isEditingFolder = editingFolderId === folder.id;

        return (
          <section key={folder.id} className="flex flex-col gap-px">
            <div
              className="group/folder flex min-h-12 items-center gap-1 rounded-xl px-2 text-xs text-muted-foreground transition-[background-color,color] hover:bg-muted/60"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                reorderDraggedConversation({
                  folderId: folder.id,
                  pinned: false,
                });
              }}
            >
              <FolderIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {isEditingFolder ? (
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <Input
                    aria-label={t("folderName")}
                    value={editingFolderName}
                    onChange={(event) =>
                      setEditingFolderName(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        const name = editingFolderName.trim();
                        if (name) {
                          onRenameConversationFolder?.(folder.id, name);
                          setEditingFolderId(null);
                        }
                      }
                      if (event.key === "Escape") setEditingFolderId(null);
                    }}
                    className="h-10 min-w-0 rounded-lg px-3 text-xs"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  type={BUTTON_TYPE}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-expanded={open}
                  onClick={() => setFolderOpen(folder.id, !open)}
                >
                  <ChevronDownIcon
                    className={cn(
                      "size-3 shrink-0 transition-transform",
                      !open && "-rotate-90",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium">{folder.name}</span>
                  <span className="text-muted-foreground/50">
                    {folderConversations.length}
                  </span>
                </button>
              )}
              {!readOnly ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type={BUTTON_TYPE}
                      size="icon-sm"
                      variant={GHOST_VARIANT}
                      className="size-10 rounded-xl transition-[background-color,opacity] md:opacity-0 md:group-hover/folder:opacity-100 md:group-focus-within/folder:opacity-100 data-[state=open]:opacity-100"
                      aria-label={t("folderActions")}
                    >
                      <MoreHorizontalIcon
                        className="size-3"
                        aria-hidden="true"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        window.requestAnimationFrame(() => {
                          setEditingFolderId(folder.id);
                          setEditingFolderName(folder.name);
                        });
                      }}
                      className="min-h-10 gap-2"
                    >
                      <PencilIcon className="size-3.5" aria-hidden="true" />
                      {t("rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onDeleteConversationFolder?.(folder.id)}
                      className="min-h-10 gap-2"
                    >
                      <Trash2Icon className="size-3.5" aria-hidden="true" />
                      {t("deleteFolder")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            {open ? (
              <div className="flex flex-col gap-px pl-3">
                {folderConversations.length > 0 ? (
                  folderConversations.map((conversation) =>
                    renderConversation(conversation),
                  )
                ) : (
                  <div
                    className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground/60"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      reorderDraggedConversation({
                        folderId: folder.id,
                        pinned: false,
                      });
                    }}
                  >
                    {t("dropChatsHere")}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        );
      })}

      <section
        className="flex flex-col gap-px"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          reorderDraggedConversation({
            folderId: null,
            pinned: false,
          });
        }}
      >
        {topLevelConversations.length > 0 ? (
          <>
            {topLevelConversations.map((conversation) =>
              renderConversation(conversation),
            )}
          </>
        ) : folderSections.length === 0 ? (
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground/60">
            {t("dropChatsHere")}
          </div>
        ) : null}
      </section>

      {hasMoreConversations && onLoadMoreConversations ? (
        <Button
          type={BUTTON_TYPE}
          variant={GHOST_VARIANT}
          size="sm"
          className="mt-2 min-h-10 rounded-xl text-xs text-muted-foreground"
          disabled={loadingMoreConversations}
          onClick={onLoadMoreConversations}
        >
          {loadingMoreConversations ? t("loading") : t("loadOlder")}
        </Button>
      ) : null}
    </div>
  );
}
