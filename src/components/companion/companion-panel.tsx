"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BotIcon,
  MinusIcon,
  PlusIcon,
  SendIcon,
  SquareIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { CompanionTranscript } from "./companion-transcript";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorDetailsButton } from "@/components/ui/error-details-button";
import type { CompanionState } from "@/modules/companion/contracts";
import { usePageBridge } from "./use-page-bridge";
import { useCompanionHistory } from "./use-companion-history";
import { useCompanionPosition } from "./use-companion-position";
const noop = async () => {};
export function CompanionPanel({
  state,
  connectionError,
  onRetry,
  workspaceId,
  userId,
}: {
  state: CompanionState;
  connectionError: string;
  onRetry: () => void;
  workspaceId: string;
  userId: string;
}) {
  const t = useTranslations("companion");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [shareContext, setShareContext] = useState(true);
  const [contextId] = useState(() => crypto.randomUUID());
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const storageKey = `maiah:companion:${userId}:${workspaceId}:${state.agentId}`;
  const stream = useChatStream({
    agentId: state.agentId,
    conversationId,
    workspaceId,
    canChat: state.available && loaded && !connectionError,
    onConversationCreated: (id) => {
      setConversationId(id);
      try {
        localStorage.setItem(storageKey, id);
      } catch {}
    },
    onConversationsRefresh: noop,
  });
  const retryHistory = useCompanionHistory({
    stream,
    storageKey,
    onRestore: setConversationId,
    onLoaded: setLoaded,
    onError: setError,
  });
  useEffect(() => {
    if (open) composer.current?.focus();
    else if (wasOpen.current) launcher.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const poll = usePageBridge(
    workspaceId,
    contextId,
    open && shareContext && stream.sending,
    setError,
  );
  const position = useCompanionPosition(open);
  async function submit() {
    if (
      !input.trim() ||
      submitting ||
      stream.sending ||
      !loaded ||
      connectionError
    )
      return;
    setSubmitting(true);
    setError("");
    const content = input;
    try {
      await poll(shareContext && open);
      setInput("");
      await stream.handleSubmit(content, { companionContextId: contextId });
    } catch (cause) {
      setInput(content);
      setError(cause instanceof Error ? cause.message : t("loadError"));
    } finally {
      setSubmitting(false);
    }
  }
  function newConversation() {
    setConversationId(null);
    stream.setMessages([]);
    setError("");
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }
  return (
    <aside
      data-companion-root
      tabIndex={-1}
      title={t("moveHint")}
      className={`fixed z-50 cursor-grab active:cursor-grabbing${open ? "" : " touch-none"}`}
      style={position.style}
      aria-label={t("title")}
      onPointerDown={position.pointerDown}
      onKeyDown={position.keyDown}
    >
      <div
        style={{ display: open ? undefined : "none" }}
        className="flex h-[min(620px,calc(100dvh-16px))] w-[min(440px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        role="dialog"
        aria-modal="false"
        aria-labelledby="companion-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <header className="flex shrink-0 items-center gap-2 border-b p-2">
          <div className="min-w-0 flex-1">
            <h2 id="companion-title" className="text-sm font-semibold">
              {t("title")}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {state.name}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={stream.sending || !loaded}
            aria-label={t("newChat")}
            onClick={newConversation}
          >
            <PlusIcon />
          </Button>
          {conversationId ? (
            <Button variant="ghost" size="icon" asChild>
              <a
                href={`/${locale}/chat?agentId=${state.agentId}&conversationId=${conversationId}`}
                aria-label={t("history")}
              >
                <ExternalLinkIcon />
              </a>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("collapse")}
            onClick={() => setOpen(false)}
          >
            <MinusIcon />
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          {!stream.messages.length ? (
            <p className="p-4 text-sm text-muted-foreground">{t("welcome")}</p>
          ) : null}
          <CompanionTranscript
            stream={stream}
            loaded={loaded}
            available={state.available && !connectionError}
            workspaceId={workspaceId}
            conversationId={conversationId}
            bottomRef={bottom}
            onSuggestionClick={setInput}
            submit={async (content) => {
              await poll(shareContext && open);
              return stream.handleSubmit(content, {
                companionContextId: contextId,
              });
            }}
          />
        </div>
        {connectionError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t("loadError")}: {connectionError}
              <ErrorDetailsButton />
              <Button onClick={onRetry}>{t("retry")}</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" className="shrink-0">
            <AlertDescription>
              {error}
              <ErrorDetailsButton />
              {!loaded ? (
                <Button onClick={retryHistory}>{t("retry")}</Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <form
          className="flex shrink-0 flex-col gap-2 border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              aria-label={t("context")}
              checked={shareContext}
              onCheckedChange={(value) => setShareContext(value === true)}
            />
            {t("context")}
          </label>
          <p className="text-xs text-muted-foreground">{t("privacy")}</p>
          <Textarea
            ref={composer}
            aria-label={t("message")}
            placeholder={t("placeholder")}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={32000}
            className="max-h-32 min-h-16 resize-none"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex justify-end">
            {stream.sending ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void stream.stopGeneration()}
              >
                <SquareIcon />
                {t("stop")}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  !input.trim() ||
                  !loaded ||
                  submitting ||
                  Boolean(connectionError)
                }
              >
                <SendIcon />
                {t("send")}
              </Button>
            )}
          </div>
        </form>
      </div>
      {!open ? (
        <div className="rounded-full border bg-background p-1 shadow-xl">
          <Button
            ref={launcher}
            size="icon"
            className="rounded-full"
            aria-label={t("open")}
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <BotIcon />
          </Button>
          {stream.sending ? (
            <span role="status" className="sr-only">
              {t("working")}
            </span>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
