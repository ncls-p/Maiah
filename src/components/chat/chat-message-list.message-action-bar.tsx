"use client";

import {
  ArrowRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  GitForkIcon,
  PencilIcon,
  RefreshCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { type ChatMessage } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BUTTON_TYPE,
  COMPACT_ICON_CLASS,
  GHOST_VARIANT,
} from "./chat-message-list.initial-visible-messages";

export function MessageActionBar({
  message,
  sending,
  canEdit,
  canDelete,
  canRegenerate,
  canContinue,
  canFork,
  forking,
  onCopy,
  onEdit,
  onDelete,
  onRegenerate,
  onContinue,
  onFork,
  onNavigateBranch,
}: {
  message: ChatMessage;
  sending: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canRegenerate: boolean;
  canContinue: boolean;
  canFork: boolean;
  forking: boolean;
  onCopy: () => Promise<void> | void;
  onEdit: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
  onContinue: () => void;
  onFork: () => void;
  onNavigateBranch: (conversationId: string) => void;
}) {
  const t = useTranslations("chat.messageList");
  const [copied, setCopied] = useState(false);
  const branch = message.branch;
  const previousBranchId = branch?.conversationIds[branch.activeIndex - 1];
  const nextBranchId = branch?.conversationIds[branch.activeIndex + 1];

  const handleCopy = async () => {
    try {
      await onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <div
      className={cn(
        "mt-1 flex items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100",
        message.role === "user" ? "justify-end" : "justify-start",
      )}
    >
      <Button
        type={BUTTON_TYPE}
        size="icon-sm"
        variant={GHOST_VARIANT}
        aria-label={copied ? t("copied") : t("copyMessage")}
        className="size-6"
        disabled={sending}
        onClick={() => void handleCopy()}
      >
        {copied ? (
          <CheckIcon className="size-3 text-success" aria-hidden="true" />
        ) : (
          <CopyIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
        )}
      </Button>
      {canEdit ? (
        <Button
          type={BUTTON_TYPE}
          size="icon-sm"
          variant={GHOST_VARIANT}
          aria-label={t("editMessage")}
          className="size-6"
          disabled={sending}
          onClick={onEdit}
        >
          <PencilIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          type={BUTTON_TYPE}
          size="icon-sm"
          variant={GHOST_VARIANT}
          aria-label={t("deleteMessage")}
          className="size-6 text-destructive/70 hover:text-destructive"
          disabled={sending}
          onClick={onDelete}
        >
          <Trash2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
        </Button>
      ) : null}
      {canRegenerate ? (
        <Button
          type={BUTTON_TYPE}
          size="sm"
          variant={GHOST_VARIANT}
          aria-label={t("regenerateResponse")}
          className="h-6 gap-1 px-2 text-[11px]"
          disabled={sending}
          onClick={onRegenerate}
        >
          <RefreshCcwIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
          {t("regenerate")}
        </Button>
      ) : null}
      {canContinue ? (
        <Button
          type={BUTTON_TYPE}
          size="sm"
          variant={GHOST_VARIANT}
          aria-label={t("continueResponse")}
          className="h-6 gap-1 px-2 text-[11px]"
          disabled={sending}
          onClick={onContinue}
        >
          <ArrowRightIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
          {t("continue")}
        </Button>
      ) : null}
      {canFork ? (
        <Button
          type={BUTTON_TYPE}
          size="icon-sm"
          variant={GHOST_VARIANT}
          aria-label={t("forkConversation")}
          className="size-6"
          disabled={sending || forking}
          onClick={onFork}
        >
          <GitForkIcon
            className={cn(COMPACT_ICON_CLASS, forking && "animate-pulse")}
            aria-hidden="true"
          />
        </Button>
      ) : null}
      {branch && branch.conversationIds.length > 1 ? (
        <span className="ml-0.5 inline-flex h-6 items-center rounded-md bg-muted/55 text-[10px] tabular-nums text-muted-foreground">
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("previousFork")}
            className="size-6 rounded-md"
            disabled={!previousBranchId || sending}
            onClick={() =>
              previousBranchId && onNavigateBranch(previousBranchId)
            }
          >
            <ChevronLeftIcon
              className={COMPACT_ICON_CLASS}
              aria-hidden="true"
            />
          </Button>
          <span
            className="min-w-8 text-center"
            aria-label={t("forkPosition", {
              current: branch.activeIndex + 1,
              total: branch.conversationIds.length,
            })}
          >
            {branch.activeIndex + 1}/{branch.conversationIds.length}
          </span>
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("nextFork")}
            className="size-6 rounded-md"
            disabled={!nextBranchId || sending}
            onClick={() => nextBranchId && onNavigateBranch(nextBranchId)}
          >
            <ChevronRightIcon
              className={COMPACT_ICON_CLASS}
              aria-hidden="true"
            />
          </Button>
        </span>
      ) : null}
    </div>
  );
}
