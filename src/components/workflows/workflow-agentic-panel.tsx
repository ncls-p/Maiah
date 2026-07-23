"use client";

import {
  AlertCircleIcon,
  BotIcon,
  CheckIcon,
  CircleStopIcon,
  KeyRoundIcon,
  PlayIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { ChatTodoListCard } from "@/components/chat/chat-todo-list-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WorkflowAgenticHistoryMessage } from "@/modules/workflows/agentic";
import type { WorkflowAgentInputRequest } from "@/modules/workflows/agentic-history";
import type { WorkflowAgentRunRequest } from "@/modules/workflows/agentic-run-approvals";
import type { ChatTodoList } from "@/modules/chat/todo-list";

export type WorkflowAgenticActivity = {
  id: string;
  toolName: string;
  status: "running" | "done" | "error";
};

export function WorkflowAgenticPanel({
  messages,
  activities,
  pendingRequests,
  runRequests,
  todoList,
  input,
  running,
  historyLoading,
  submittingRequestId,
  decidingRunRequestId,
  agentName,
  onInputChange,
  onSubmit,
  onSubmitRequest,
  onDecideRunRequest,
  onStop,
}: {
  messages: WorkflowAgenticHistoryMessage[];
  activities: WorkflowAgenticActivity[];
  pendingRequests: WorkflowAgentInputRequest[];
  runRequests: WorkflowAgentRunRequest[];
  todoList: ChatTodoList | null;
  input: string;
  running: boolean;
  historyLoading: boolean;
  submittingRequestId: string | null;
  decidingRunRequestId: string | null;
  agentName: string | null;
  onInputChange: (value: string) => void;
  onSubmit: (prompt?: string) => void;
  onSubmitRequest: (
    request: WorkflowAgentInputRequest,
    values: Record<string, string>,
  ) => void;
  onDecideRunRequest: (
    request: WorkflowAgentRunRequest,
    decision: "approve" | "reject",
  ) => void;
  onStop: () => void;
}) {
  const t = useTranslations("workflows.agentic");
  const [requestValues, setRequestValues] = useState<
    Record<string, Record<string, string>>
  >({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activities, messages, pendingRequests, runRequests, running, todoList]);

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
          {historyLoading ? (
            <div className="my-auto flex items-center justify-center py-10">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : messages.length === 0 &&
            pendingRequests.length === 0 &&
            runRequests.length === 0 &&
            !todoList ? (
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
                key={message.id}
                className={cn(
                  "max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-6",
                  message.role === "user"
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border/70 bg-muted/45",
                )}
              >
                {message.content ? (
                  message.role === "assistant" ? (
                    <ChatMarkdown
                      isAnimating={running && index === messages.length - 1}
                    >
                      {message.content}
                    </ChatMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )
                ) : running && index === messages.length - 1 ? (
                  <span className="flex items-center gap-1 py-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-current" />
                  </span>
                ) : null}
              </div>
            ))
          )}

          {todoList ? <ChatTodoListCard todoList={todoList} /> : null}

          {pendingRequests.map((request) => (
            <form
              key={request.id}
              className="rounded-2xl border border-primary/25 bg-primary/5 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitRequest(request, requestValues[request.id] ?? {});
              }}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <KeyRoundIcon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{request.title}</h3>
                  {request.description ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {request.description}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {request.fields.map((field) => {
                  const id = `${request.id}-${field.name}`;
                  const hidden =
                    field.sensitive ||
                    field.type === "secret" ||
                    field.type === "password";
                  return (
                    <div key={field.name} className="space-y-1.5">
                      <Label htmlFor={id} className="text-xs">
                        {field.label}
                        {field.required ? " *" : ""}
                      </Label>
                      {field.type === "textarea" && !hidden ? (
                        <Textarea
                          id={id}
                          value={requestValues[request.id]?.[field.name] ?? ""}
                          onChange={(event) =>
                            setRequestValues((current) => ({
                              ...current,
                              [request.id]: {
                                ...current[request.id],
                                [field.name]: event.target.value,
                              },
                            }))
                          }
                          required={field.required}
                          disabled={submittingRequestId === request.id}
                          className="min-h-20 bg-background"
                        />
                      ) : (
                        <Input
                          id={id}
                          type={
                            hidden
                              ? "password"
                              : field.type === "url"
                                ? "url"
                                : field.type === "number"
                                  ? "number"
                                  : "text"
                          }
                          value={requestValues[request.id]?.[field.name] ?? ""}
                          onChange={(event) =>
                            setRequestValues((current) => ({
                              ...current,
                              [request.id]: {
                                ...current[request.id],
                                [field.name]: event.target.value,
                              },
                            }))
                          }
                          required={field.required}
                          disabled={submittingRequestId === request.id}
                          autoComplete={hidden ? "off" : undefined}
                          className="bg-background"
                        />
                      )}
                      {field.description ? (
                        <p className="text-[11px] text-muted-foreground">
                          {field.description}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {request.fields.some((field) => field.sensitive) ? (
                <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
                  {t("secureInputHint")}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={running || submittingRequestId === request.id}
                >
                  {submittingRequestId === request.id ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  {t("submitInformation")}
                </Button>
              </div>
            </form>
          ))}

          {runRequests.map((request) => (
            <section
              key={request.id}
              className="rounded-2xl border border-amber-500/35 bg-amber-500/5 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <ShieldCheckIcon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{request.title}</h3>
                  {request.reason ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {request.reason}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {t("runApprovalHint")}
              </p>
              <div className="mt-3 rounded-lg border border-border/70 bg-background/80 p-3">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("runVersion", { version: request.expectedVersion })}
                </p>
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  {t("runInput")}
                </p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(request.inputPreview, null, 2)}
                </pre>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={running || decidingRunRequestId === request.id}
                  onClick={() => onDecideRunRequest(request, "reject")}
                >
                  <XIcon data-icon="inline-start" />
                  {t("rejectRun")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={running || decidingRunRequestId === request.id}
                  onClick={() => onDecideRunRequest(request, "approve")}
                >
                  {decidingRunRequestId === request.id ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <PlayIcon data-icon="inline-start" />
                  )}
                  {t("approveAndRun")}
                </Button>
              </div>
            </section>
          ))}

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
          <div ref={bottomRef} aria-hidden="true" />
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
