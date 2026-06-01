"use client";

import { memo, useState } from "react";
import {
  BrainIcon,
  CheckIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCcwIcon,
  ShieldAlertIcon,
  Trash2Icon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

import { CitationBlock } from "@/components/chat/citation-block";
import {
  citationsFromMessage,
  parseToolPart,
  renderablePartsFromMessage,
  textFromMessage,
  type ChatMessage,
  type ChatMessagePart,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function stringifyForMatch(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sanitizeToolName(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
}

function toolNameMatches(
  toolCallName: string | undefined,
  approvalName: string,
) {
  if (!toolCallName) return false;
  if (toolCallName === approvalName) return true;
  const sanitizedApprovalName = sanitizeToolName(approvalName);
  return (
    toolCallName === sanitizedApprovalName ||
    toolCallName.endsWith(`_${sanitizedApprovalName}`)
  );
}

function formatToolName(toolName: string | undefined) {
  if (!toolName) return "Tool";
  const withoutPrefix = toolName.replace(/^mcp_[0-9a-f_]{36,}_(.+)$/i, "$1");
  return withoutPrefix
    .replace(/__+/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeToolBody(
  toolName: string | undefined,
  body: unknown,
  isCall: boolean,
) {
  if (isCall) return summarizeToolInput(formatToolName(toolName), body);
  if (body === null || body === undefined) return "The tool finished.";
  if (typeof body === "string") return body.slice(0, 180);
  if (Array.isArray(body))
    return `Returned ${body.length} item${body.length === 1 ? "" : "s"}.`;
  if (typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.slice(0, 180);
    if (typeof record.content === "string") return record.content.slice(0, 180);
    const keys = Object.keys(record);
    return keys.length > 0
      ? `Returned ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "…" : ""}.`
      : "The tool finished.";
  }
  return String(body).slice(0, 180);
}

function toolPartMatchesApproval(
  part: ChatMessagePart,
  pendingApproval: PendingToolApproval | null | undefined,
) {
  if (!pendingApproval || part.type !== "tool-call") return false;
  const parsed = parseToolPart(part.content);
  return (
    toolNameMatches(parsed.toolName, pendingApproval.toolName) &&
    (parsed.input === undefined ||
      stringifyForMatch(pendingApproval.input) ===
        stringifyForMatch(parsed.input))
  );
}

function PendingApprovalCard({
  pendingApproval,
  onApprove,
  onReject,
}: {
  pendingApproval: PendingToolApproval;
  onApprove?: (approval: PendingToolApproval) => void;
  onReject?: (approval: PendingToolApproval) => void;
}) {
  const friendlyName = formatToolName(pendingApproval.toolName);
  const summary = summarizeToolInput(friendlyName, pendingApproval.input);

  return (
    <div className="overflow-hidden rounded-xl border border-warning/45 bg-warning/5 text-xs shadow-sm">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-warning/35 bg-warning/15 text-warning">
          <ShieldAlertIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">Needs approval</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
              {friendlyName}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-muted-foreground">{summary}</p>
        </div>
      </div>
      <div className="border-t border-warning/25 bg-warning/10 px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-foreground">
            The assistant is waiting before running this action.
          </p>
          <div className="flex shrink-0 justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={() => onReject?.(pendingApproval)}
            >
              <XIcon data-icon="inline-start" aria-hidden="true" />
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => onApprove?.(pendingApproval)}
            >
              <CheckIcon data-icon="inline-start" aria-hidden="true" />
              Approve
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolPartCard({
  part,
  approval,
  onApprove,
  onReject,
}: {
  part: ChatMessagePart;
  approval?: PendingToolApproval;
  onApprove?: (approval: PendingToolApproval) => void;
  onReject?: (approval: PendingToolApproval) => void;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseToolPart(part.content);
  const isCall = part.type === "tool-call";
  const body = isCall ? parsed.input : parsed.output;
  const friendlyName = formatToolName(parsed.toolName);
  const approvalMatches = Boolean(approval);
  const bodyText =
    typeof body === "string" ? body : JSON.stringify(body ?? {}, null, 2);
  const summary = summarizeToolBody(parsed.toolName, body, isCall);
  const statusLabel = approvalMatches
    ? "Needs approval"
    : isCall
      ? "Action proposed"
      : "Result received";
  const Icon = approvalMatches
    ? ShieldAlertIcon
    : isCall
      ? WrenchIcon
      : CheckCircle2Icon;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "overflow-hidden rounded-xl border bg-background/80 text-xs shadow-sm",
        approvalMatches ? "border-warning/45 bg-warning/5" : "border-border/60",
      )}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
            approvalMatches
              ? "border-warning/35 bg-warning/15 text-warning"
              : isCall
                ? "border-primary/15 bg-primary/10 text-primary"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{statusLabel}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
              {friendlyName}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-muted-foreground">{summary}</p>
        </div>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
          >
            <ChevronDownIcon
              className={cn(
                "size-3 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
            {open ? "Hide" : "Raw"}
          </Button>
        </CollapsibleTrigger>
      </div>
      {approval ? (
        <div className="border-t border-warning/25 bg-warning/10 px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-foreground">
              The assistant is waiting before running this action.
            </p>
            <div className="flex shrink-0 justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={() => onReject?.(approval)}
              >
                <XIcon data-icon="inline-start" aria-hidden="true" />
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => onApprove?.(approval)}
              >
                <CheckIcon data-icon="inline-start" aria-hidden="true" />
                Approve
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <CollapsibleContent>
        <div className="border-t border-border/60 bg-muted/25 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>{isCall ? "Input sent to tool" : "Tool output"}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-md bg-background/80 p-2 text-[11px] leading-5 text-muted-foreground">
            {bodyText || "(no body)"}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ThinkingPart({ part }: { part: ChatMessagePart }) {
  const [open, setOpen] = useState(false);
  const preview = part.content.trim().slice(0, 180);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-xl border border-border/50 bg-muted/35 text-xs"
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground">
          <BrainIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              Assistant is reasoning
            </span>
            <span className="size-1.5 rounded-full bg-primary/70 animate-pulse" />
          </div>
          {preview ? (
            <p className="mt-1 line-clamp-2 text-muted-foreground">{preview}</p>
          ) : null}
        </div>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
          >
            <ChevronDownIcon
              className={cn(
                "size-3 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
            {open ? "Hide" : "Notes"}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <Streamdown
          plugins={{ code }}
          className="border-t border-border/50 bg-background/50 px-3 py-2.5 text-xs leading-5 text-muted-foreground"
        >
          {part.content}
        </Streamdown>
      </CollapsibleContent>
    </Collapsible>
  );
}

const MessageContent = memo(function MessageContent({
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
}: {
  message: ChatMessage;
  isEditing: boolean;
  editingContent: string;
  isSaving: boolean;
  isAnimating: boolean;
  onEditingContentChange?: (content: string) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  pendingApprovals: PendingToolApproval[];
  onApproveTool?: (approval: PendingToolApproval) => void;
  onRejectTool?: (approval: PendingToolApproval) => void;
}) {
  const content = textFromMessage(message);
  const citations = citationsFromMessage(message);
  const isAssistant = message.role === "assistant";
  const renderableParts = renderablePartsFromMessage(message).filter(
    (part) => part.type !== "text" || part.content,
  );
  const approvalByPartIndex = new Map<number, PendingToolApproval>();
  const matchedApprovalIds = new Set<string>();
  if (message.status === "streaming") {
    for (
      let partIndex = renderableParts.length - 1;
      partIndex >= 0;
      partIndex -= 1
    ) {
      const part = renderableParts[partIndex];
      if (part.type !== "tool-call") continue;
      const approval = pendingApprovals.find(
        (item) =>
          !matchedApprovalIds.has(item.invocationId) &&
          toolPartMatchesApproval(part, item),
      );
      if (!approval) continue;
      approvalByPartIndex.set(partIndex, approval);
      matchedApprovalIds.add(approval.invocationId);
    }
  }
  const standaloneApprovals =
    message.status === "streaming"
      ? pendingApprovals.filter(
          (approval) => !matchedApprovalIds.has(approval.invocationId),
        )
      : [];

  if (isEditing) {
    return (
      <div className="flex min-w-72 flex-col gap-2">
        <Textarea
          value={editingContent}
          onChange={(event) => onEditingContentChange?.(event.target.value)}
          rows={3}
          disabled={isSaving}
          className="min-h-24 bg-background/80 text-foreground"
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isSaving}
            onClick={onCancelEdit}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSaving || !editingContent.trim()}
            onClick={onSaveEdit}
          >
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!isAssistant) {
    return content;
  }

  return (
    <div className="flex flex-col gap-2">
      {citations.length > 0 ? <CitationBlock citations={citations} /> : null}
      {standaloneApprovals.length > 0
        ? standaloneApprovals.map((approval) => (
            <PendingApprovalCard
              key={approval.invocationId}
              pendingApproval={approval}
              onApprove={onApproveTool}
              onReject={onRejectTool}
            />
          ))
        : null}
      {renderableParts.length > 0 ? (
        renderableParts.map((part, partIndex) => {
          if (part.type === "reasoning") {
            return (
              <ThinkingPart
                key={`${message.id}-${part.type}-${partIndex}`}
                part={part}
              />
            );
          }
          if (part.type === "tool-call" || part.type === "tool-result") {
            return (
              <ToolPartCard
                key={`${message.id}-${part.type}-${partIndex}`}
                part={part}
                approval={approvalByPartIndex.get(partIndex)}
                onApprove={onApproveTool}
                onReject={onRejectTool}
              />
            );
          }
          return (
            <Streamdown
              key={`${message.id}-${part.type}-${partIndex}`}
              plugins={{ code }}
              caret="block"
              isAnimating={isAnimating}
              className="text-sm"
            >
              {part.content}
            </Streamdown>
          );
        })
      ) : standaloneApprovals.length === 0 ? (
        <Streamdown
          plugins={{ code }}
          caret="block"
          isAnimating={isAnimating}
          className="text-sm"
        >
          {content || "Thinking…"}
        </Streamdown>
      ) : null}
    </div>
  );
});

interface ChatMessageListProps {
  messages: ChatMessage[];
  sending: boolean;
  loading?: boolean;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onEditMessage?: (
    message: ChatMessage,
    content: string,
  ) => Promise<void> | void;
  onDeleteMessage?: (message: ChatMessage) => Promise<void> | void;
  onResendMessage?: (message: ChatMessage) => Promise<void> | void;
  pendingApprovals?: PendingToolApproval[];
  onApproveTool?: (approval: PendingToolApproval) => void;
  onRejectTool?: (approval: PendingToolApproval) => void;
}

export function ChatMessageList({
  messages,
  sending,
  loading,
  bottomRef,
  onEditMessage,
  onDeleteMessage,
  onResendMessage,
  pendingApprovals = [],
  onApproveTool,
  onRejectTool,
}: ChatMessageListProps) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-20 w-2/3 rounded-2xl" />
        <Skeleton className="ml-auto h-16 w-1/2 rounded-2xl" />
        <Skeleton className="h-24 w-3/4 rounded-2xl" />
      </div>
    );
  }

  if (messages.length === 0) {
    return <div ref={bottomRef} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      {messages.map((message, index) => {
        const content = textFromMessage(message);
        const isAssistant = message.role === "assistant";
        const isUser = message.role === "user";
        const canEdit = Boolean(onEditMessage) && (isUser || isAssistant);
        const canDelete = Boolean(onDeleteMessage);
        const canResend = Boolean(onResendMessage) && isUser;
        const isEditing = editingMessageId === message.id;
        const isAnimating =
          sending &&
          index === messages.length - 1 &&
          message.status === "streaming";

        return (
          <article
            key={message.id}
            className={cn(
              "group/message flex gap-2 animate-in-up",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {message.role !== "user" && (canEdit || canDelete) ? (
              <MessageActions
                message={message}
                sending={sending}
                canEdit={canEdit}
                canDelete={canDelete}
                canResend={canResend}
                onEdit={() => {
                  setEditingMessageId(message.id);
                  setEditingContent(content);
                }}
                onDelete={() => void onDeleteMessage?.(message)}
                onResend={() => void onResendMessage?.(message)}
              />
            ) : null}
            <div
              className={cn(
                "max-w-[88%] transition-all duration-200",
                message.role === "user"
                  ? "msg-bubble--user"
                  : "msg-bubble--assistant",
              )}
            >
              <MessageContent
                message={message}
                isEditing={isEditing}
                editingContent={isEditing ? editingContent : ""}
                isSaving={savingMessageId === message.id}
                isAnimating={isAnimating}
                onEditingContentChange={
                  isEditing ? setEditingContent : undefined
                }
                onCancelEdit={
                  isEditing
                    ? () => {
                        setEditingMessageId(null);
                        setEditingContent("");
                      }
                    : undefined
                }
                onSaveEdit={
                  isEditing
                    ? async () => {
                        setSavingMessageId(message.id);
                        try {
                          await onEditMessage?.(message, editingContent.trim());
                          setEditingMessageId(null);
                          setEditingContent("");
                        } finally {
                          setSavingMessageId(null);
                        }
                      }
                    : undefined
                }
                pendingApprovals={pendingApprovals}
                onApproveTool={onApproveTool}
                onRejectTool={onRejectTool}
              />
            </div>
            {message.role === "user" && (canEdit || canDelete || canResend) ? (
              <MessageActions
                message={message}
                sending={sending}
                canEdit={canEdit}
                canDelete={canDelete}
                canResend={canResend}
                onEdit={() => {
                  setEditingMessageId(message.id);
                  setEditingContent(content);
                }}
                onDelete={() => void onDeleteMessage?.(message)}
                onResend={() => void onResendMessage?.(message)}
              />
            ) : null}
          </article>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageActions({
  sending,
  canEdit,
  canDelete,
  canResend,
  onEdit,
  onDelete,
  onResend,
}: {
  message: ChatMessage;
  sending: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canResend: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResend: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Message actions"
          className="mt-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/message:opacity-100 data-open:opacity-100"
          disabled={sending}
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {canResend ? (
            <DropdownMenuItem onSelect={onResend}>
              <RefreshCcwIcon aria-hidden="true" />
              Resend
            </DropdownMenuItem>
          ) : null}
          {canEdit ? (
            <DropdownMenuItem onSelect={onEdit}>
              <PencilIcon aria-hidden="true" />
              Edit
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
