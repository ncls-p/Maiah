"use client";

import {
  AlertCircleIcon,
  BotIcon,
  CheckIcon,
  CircleStopIcon,
  SendIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent, KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WorkflowAgenticMessage } from "@/modules/workflows/agentic";

export type WorkflowAgenticActivity = {
  id: string;
  toolName: string;
  status: "running" | "done" | "error";
};

export function WorkflowAgenticPanel({
  messages,
  activities,
  input,
  running,
  agentName,
  onInputChange,
  onSubmit,
  onStop,
}: {
  messages: WorkflowAgenticMessage[];
  activities: WorkflowAgenticActivity[];
  input: string;
  running: boolean;
  agentName: string | null;
  onInputChange: (value: string) => void;
  onSubmit: (prompt?: string) => void;
  onStop: () => void;
}) {
  const t = useTranslations("workflows.agentic");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BotIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("title")}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {agentName ? t("using", { name: agentName }) : t("description")}
            </p>
          </div>
          {running ? (
            <Badge variant="secondary" className="ml-auto">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {t("working")}
            </Badge>
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col gap-4 p-4" aria-live="polite">
          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center px-2 py-8 text-center">
              <span className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <SparklesIcon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-sm font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                {t("emptyDescription")}
              </p>
              <div className="mt-5 flex w-full max-w-sm flex-col gap-2">
                {(["suggestionCreate", "suggestionImprove"] as const).map(
                  (key) => (
                    <Button
                      key={key}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto justify-start whitespace-normal py-2 text-left"
                      onClick={() => onSubmit(t(key))}
                    >
                      {t(key)}
                    </Button>
                  ),
                )}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  "max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-6",
                  message.role === "user"
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border/70 bg-muted/45",
                )}
              >
                {message.content ||
                  (running && index === messages.length - 1 ? (
                    <span className="flex items-center gap-1 py-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-current" />
                    </span>
                  ) : null)}
              </div>
            ))
          )}

          {activities.length > 0 ? (
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t("activity")}
              </p>
              <div className="flex flex-col gap-2">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background">
                      {activity.status === "done" ? (
                        <CheckIcon
                          className="size-3.5 text-emerald-600"
                          aria-hidden="true"
                        />
                      ) : activity.status === "error" ? (
                        <AlertCircleIcon
                          className="size-3.5 text-destructive"
                          aria-hidden="true"
                        />
                      ) : (
                        <WrenchIcon
                          className="size-3.5 animate-pulse text-primary"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span>{t(`tools.${activity.toolName}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <form
        onSubmit={submit}
        className="border-t border-border/70 bg-background p-3"
      >
        <div className="rounded-xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
          <Textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="min-h-24 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            disabled={running}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <span className="text-[11px] text-muted-foreground">
              {t("enterHint")}
            </span>
            {running ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onStop}
              >
                <CircleStopIcon data-icon="inline-start" />
                {t("stop")}
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={!input.trim()}
                aria-label={t("send")}
              >
                <SendIcon data-icon="inline-start" />
                {t("send")}
              </Button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
