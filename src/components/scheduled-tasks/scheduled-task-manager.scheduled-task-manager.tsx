"use client";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChatAgent } from "@/components/chat/chat-types";
import { fetchJson } from "@/lib/api-client";
import { DAILY_FREQUENCY, ScheduleFrequency, ScheduledTask, localTimeZone, formatNextRun, statusToneClass, statusVariant } from "./scheduled-task-manager.daily-frequency";
import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import { Loader2Icon, PlusIcon, SaveIcon, CalendarClockIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageEmptyState } from "@/components/page-empty-state";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function useScheduledTaskManagerController({
  workspaceId,
  agents,
}: {
  workspaceId: string | null;
  agents: ChatAgent[];
}) {
  const locale = useLocale();
  const t = useTranslations("scheduledTasks");
  const tCommon = useTranslations("common");
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [title, setTitle] = useState(t("defaults.title"));
  const [prompt, setPrompt] = useState(t("defaults.prompt"));
  const [frequency, setFrequency] =
    useState<ScheduleFrequency>(DAILY_FREQUENCY);
  const [timeOfDay, setTimeOfDay] = useState("08:00");
  const [intervalMinutes, setIntervalMinutes] = useState("1440");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [enabled, setEnabled] = useState(true);
  const [pendingDeleteTask, setPendingDeleteTask] =
    useState<ScheduledTask | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(
    () => new Set(),
  );

  const currentAgentId = useMemo(
    () => agentId || agents[0]?.id || "",
    [agentId, agents],
  );
  const enabledTasks = tasks.filter((task) => task.enabled).length;
  const successfulTasks = tasks.filter(
    (task) => task.lastStatus === "success",
  ).length;
  const successRate =
    tasks.length > 0 ? Math.round((successfulTasks / tasks.length) * 100) : 0;
  const nextTask = tasks.find((task) => task.enabled) ?? null;
  const statusLabels = {
    idle: t("status.idle"),
    running: t("status.running"),
    success: t("status.success"),
    failed: t("status.failed"),
  };

  const loadTasks = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchJson<{ tasks: ScheduledTask[] }>(
        `/api/workspace/scheduled-tasks?workspaceId=${workspaceId}`,
      );
      setTasks(data.tasks);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTasks(), 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadTasks]);

  function openCreateEditor() {
    setEditingTask(null);
    setTitle(t("defaults.title"));
    setPrompt(t("defaults.prompt"));
    setFrequency(DAILY_FREQUENCY);
    setTimeOfDay("08:00");
    setIntervalMinutes("1440");
    setAgentId(agents[0]?.id ?? "");
    setEnabled(true);
    setEditorOpen(true);
  }

  function openTaskEditor(task: ScheduledTask) {
    setEditingTask(task);
    setTitle(task.title);
    setPrompt(task.prompt);
    setFrequency(task.frequency);
    setTimeOfDay(task.timeOfDay ?? "08:00");
    setIntervalMinutes(String(task.intervalMinutes ?? 1440));
    setAgentId(task.agentId);
    setEnabled(task.enabled);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (!saving) setEditorOpen(false);
  }

  async function saveTask() {
    const trimmedTitle = title.trim();
    const trimmedPrompt = prompt.trim();
    if (!workspaceId) return;
    if (!currentAgentId) return;
    if (!trimmedTitle) return;
    if (!trimmedPrompt) return;
    setSaving(true);
    try {
      const endpoint = editingTask
        ? `/api/workspace/scheduled-tasks/${editingTask.id}`
        : "/api/workspace/scheduled-tasks";
      const data = await fetchJson<{ task: ScheduledTask }>(endpoint, {
        method: editingTask ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          agentId: currentAgentId,
          ...(editingTask ? {} : { conversationId: null }),
          title: trimmedTitle,
          prompt: trimmedPrompt,
          frequency,
          timezone: editingTask?.timezone ?? localTimeZone(),
          timeOfDay: frequency === DAILY_FREQUENCY ? timeOfDay : null,
          intervalMinutes:
            frequency === "interval" ? Number(intervalMinutes) : null,
          ...(editingTask ? { enabled } : {}),
        }),
      });
      setTasks((current) =>
        editingTask
          ? current.map((task) => (task.id === data.task.id ? data.task : task))
          : [data.task, ...current],
      );
      setEditorOpen(false);
      toast.success(t(editingTask ? "toasts.updated" : "toasts.created"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(editingTask ? "toasts.updateFailed" : "toasts.createFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task: ScheduledTask, enabled: boolean) {
    if (!workspaceId || updatingTaskIds.has(task.id)) return;
    setUpdatingTaskIds((current) => new Set(current).add(task.id));
    try {
      const data = await fetchJson<{ task: ScheduledTask }>(
        `/api/workspace/scheduled-tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, enabled }),
        },
      );
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? data.task : item)),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.updateFailed"),
      );
    } finally {
      setUpdatingTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  async function deleteTask(task: ScheduledTask) {
    if (!workspaceId || deletingTaskId) return;
    setDeletingTaskId(task.id);
    try {
      await fetchJson(
        `/api/workspace/scheduled-tasks/${task.id}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setPendingDeleteTask(null);
      toast.success(t("toasts.deleted"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.deleteFailed"),
      );
    } finally {
      setDeletingTaskId(null);
    }
  }

  function formatFrequency(task: ScheduledTask) {
    if (task.frequency === DAILY_FREQUENCY) {
      return t("dailyAt", { time: task.timeOfDay ?? "—" });
    }
    return t("intervalEvery", { minutes: task.intervalMinutes ?? 0 });
  }

  return {
    kind: "ready",
    agents,
    closeEditor,
    currentAgentId,
    deleteTask,
    deletingTaskId,
    enabledTasks,
    enabled,
    editingTask,
    editorOpen,
    formatFrequency,
    frequency,
    intervalMinutes,
    loadError,
    loadTasks,
    loading,
    locale,
    nextTask,
    openCreateEditor,
    openTaskEditor,
    pendingDeleteTask,
    prompt,
    saving,
    saveTask,
    setAgentId,
    setEditorOpen,
    setEnabled,
    setFrequency,
    setIntervalMinutes,
    setPendingDeleteTask,
    setPrompt,
    setTimeOfDay,
    setTitle,
    statusLabels,
    successRate,
    t,
    tCommon,
    tasks,
    timeOfDay,
    title,
    toggleTask,
    updatingTaskIds,
    workspaceId,
  } as const;
}

export function ScheduledTaskManager(
  ...args: Parameters<typeof useScheduledTaskManagerController>
) {
  const model = useScheduledTaskManagerController(...args);
  if (!("kind" in model)) return model;
  return <ScheduledTaskManagerView model={model} />;
}


export type ScheduledTaskManagerViewModel = Extract<
  ReturnType<typeof useScheduledTaskManagerController>,
  { kind: "ready" }
>;
export function ScheduledTaskManagerView({
  model,
}: {
  model: ScheduledTaskManagerViewModel;
}) {
  const {
    deleteTask,
    deletingTaskId,
    pendingDeleteTask,
    setPendingDeleteTask,
    t,
  } = model;
  return (
    <>
      <ScheduledTaskManagerSection2 model={model} />

      <ScheduledTaskManagerSection1 model={model} />
      <DestructiveConfirmationDialog
        open={pendingDeleteTask !== null}
        title={t("deleteTitle")}
        description={t("deleteDescription", {
          title: pendingDeleteTask?.title ?? "",
        })}
        cancelLabel={t("deleteCancel")}
        confirmLabel={deletingTaskId ? t("deleting") : t("deleteConfirm")}
        busy={deletingTaskId !== null}
        onOpenChange={(open) => {
          if (!open && !deletingTaskId) setPendingDeleteTask(null);
        }}
        onConfirm={() => {
          if (pendingDeleteTask) void deleteTask(pendingDeleteTask);
        }}
      />
    </>
  );
}


export function ScheduledTaskManagerSection1({
  model,
}: {
  model: ScheduledTaskManagerViewModel;
}) {
  const {
    agents,
    closeEditor,
    currentAgentId,
    editingTask,
    editorOpen,
    enabled,
    frequency,
    intervalMinutes,
    loadError,
    locale,
    prompt,
    saveTask,
    saving,
    setAgentId,
    setEditorOpen,
    setEnabled,
    setFrequency,
    setIntervalMinutes,
    setPrompt,
    setTimeOfDay,
    setTitle,
    statusLabels,
    t,
    tCommon,
    timeOfDay,
    title,
    workspaceId,
  } = model;

  return (
    <Dialog
      open={editorOpen}
      onOpenChange={(open) => {
        if (open) setEditorOpen(true);
        else closeEditor();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(48rem,calc(100dvh-2rem))] sm:max-w-2xl">
        <DialogHeader className="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <DialogTitle>
            {t(editingTask ? "edit.title" : "create.title")}
          </DialogTitle>
          <DialogDescription>
            {t(editingTask ? "edit.description" : "create.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6">
          {editingTask ? (
            <div className="mb-5 grid gap-3 rounded-xl border bg-muted/20 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("details.status")}
                </p>
                <Badge
                  variant={statusVariant(editingTask.lastStatus)}
                  className={statusToneClass(editingTask.lastStatus)}
                >
                  {statusLabels[
                    editingTask.lastStatus as keyof typeof statusLabels
                  ] ?? editingTask.lastStatus}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("details.nextRun")}
                </p>
                <p>{formatNextRun(editingTask.nextRunAt, locale)}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  {t("details.timezone")}
                </p>
                <p>{editingTask.timezone}</p>
              </div>
              {editingTask.lastError ? (
                <p className="rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive sm:col-span-2">
                  {editingTask.lastError}
                </p>
              ) : null}
            </div>
          ) : null}

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="scheduled-task-title">
                {t("fields.title")}
              </FieldLabel>
              <Input
                id="scheduled-task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="scheduled-task-prompt">
                {t("fields.prompt")}
              </FieldLabel>
              <Textarea
                id="scheduled-task-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
              />
            </Field>
            <div
              data-slot="scheduled-task-schedule-fields"
              className="grid min-w-0 gap-4 sm:grid-cols-2"
            >
              <Field className="min-w-0 sm:col-span-2">
                <FieldLabel>{t("fields.assistant")}</FieldLabel>
                <Select value={currentAgentId} onValueChange={setAgentId}>
                  <SelectTrigger
                    aria-label={t("fields.assistant")}
                    className="w-full min-w-0"
                  >
                    <SelectValue
                      placeholder={t("fields.assistantPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="min-w-0">
                <FieldLabel>{t("fields.frequency")}</FieldLabel>
                <Select
                  value={frequency}
                  onValueChange={(value) =>
                    setFrequency(value as ScheduleFrequency)
                  }
                >
                  <SelectTrigger
                    aria-label={t("fields.frequency")}
                    className="w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={DAILY_FREQUENCY}>
                        {t("frequency.daily")}
                      </SelectItem>
                      <SelectItem value="interval">
                        {t("frequency.interval")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor="scheduled-task-schedule">
                  {frequency === DAILY_FREQUENCY
                    ? t("fields.time")
                    : t("fields.minutes")}
                </FieldLabel>
                <Input
                  id="scheduled-task-schedule"
                  type={frequency === DAILY_FREQUENCY ? "time" : "number"}
                  min={frequency === DAILY_FREQUENCY ? undefined : 5}
                  value={
                    frequency === DAILY_FREQUENCY ? timeOfDay : intervalMinutes
                  }
                  onChange={(event) =>
                    frequency === DAILY_FREQUENCY
                      ? setTimeOfDay(event.target.value)
                      : setIntervalMinutes(event.target.value)
                  }
                />
              </Field>
            </div>
            {editingTask ? (
              <Field
                orientation="horizontal"
                className="items-center rounded-xl border bg-muted/20 p-3"
              >
                <FieldContent>
                  <FieldLabel htmlFor="scheduled-task-enabled">
                    {t("fields.enabled")}
                  </FieldLabel>
                  <FieldDescription className="text-xs">
                    {t("edit.enabledHint")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="scheduled-task-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </Field>
            ) : null}
          </FieldGroup>
        </div>

        <DialogFooter className="m-0 shrink-0 rounded-b-2xl px-4 py-3 [&_[data-slot=button]]:w-full sm:m-0 sm:rounded-b-3xl sm:px-6 sm:py-4 sm:[&_[data-slot=button]]:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={closeEditor}
            disabled={saving}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void saveTask()}
            disabled={
              saving ||
              loadError ||
              !workspaceId ||
              !currentAgentId ||
              !title.trim() ||
              !prompt.trim()
            }
          >
            {saving ? (
              <Loader2Icon
                data-icon="inline-start"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : editingTask ? (
              <SaveIcon data-icon="inline-start" aria-hidden="true" />
            ) : (
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {t(editingTask ? "edit.submit" : "create.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function ScheduledTaskManagerSection2({
  model,
}: {
  model: ScheduledTaskManagerViewModel;
}) {
  const {
    deletingTaskId,
    enabledTasks,
    formatFrequency,
    loadError,
    loadTasks,
    loading,
    locale,
    nextTask,
    openCreateEditor,
    openTaskEditor,
    setPendingDeleteTask,
    statusLabels,
    successRate,
    t,
    tasks,
    toggleTask,
    updatingTaskIds,
  } = model;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={openCreateEditor}>
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("create.submit")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: t("overview.activeLabel"),
            value: String(enabledTasks).padStart(2, "0"),
          },
          {
            label: t("overview.successLabel"),
            value: `${successRate}%`,
          },
          {
            label: t("overview.totalLabel"),
            value: String(tasks.length).padStart(2, "0"),
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border bg-card px-4 py-3.5"
          >
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-muted-foreground">
              {stat.label}
            </p>
            <p className="workspace-page-heading mt-1.5 text-3xl leading-none tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("overview.title")}</CardTitle>
          <CardDescription>
            {t("overview.description", {
              active: enabledTasks,
              total: tasks.length,
            })}
          </CardDescription>
          <CardAction>
            <Badge variant="outline">
              {t("overview.activeCount", { count: enabledTasks })}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              {t("loading")}
            </div>
          ) : loadError ? (
            <div className="min-h-48 py-8 text-center" role="alert">
              <p className="text-sm font-medium">{t("toasts.loadFailed")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {t("tasksLoadErrorDescription")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => void loadTasks()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : tasks.length === 0 ? (
            <PageEmptyState
              icon={CalendarClockIcon}
              title={t("empty.title")}
              description={t("empty.description")}
              className="border border-dashed border-border/70 bg-muted/20"
            />
          ) : (
            <div className="grid gap-3">
              {nextTask ? (
                <div className="rounded-xl border border-primary/20 bg-primary/7 p-3 text-sm">
                  <p className="font-medium text-primary">
                    {t("overview.nextRun")}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {nextTask.title} ·{" "}
                    {formatNextRun(nextTask.nextRunAt, locale)}
                  </p>
                </div>
              ) : null}
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="grid gap-3 rounded-xl border border-border/70 bg-background/55 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {task.title}
                      </p>
                      <Badge
                        variant={statusVariant(task.lastStatus)}
                        className={statusToneClass(task.lastStatus)}
                      >
                        {statusLabels[
                          task.lastStatus as keyof typeof statusLabels
                        ] ?? task.lastStatus}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatFrequency(task)} ·{" "}
                      {t("nextRun", {
                        date: formatNextRun(task.nextRunAt, locale),
                      })}
                    </p>
                    {task.lastError ? (
                      <p className="mt-2 rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        {task.lastError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openTaskEditor(task)}
                      aria-label={t("editTask", { title: task.title })}
                    >
                      <SquarePenIcon className="size-4" aria-hidden="true" />
                      <span className="hidden sm:inline">
                        {t("details.action")}
                      </span>
                    </Button>
                    <Switch
                      checked={task.enabled}
                      onCheckedChange={(enabled) =>
                        void toggleTask(task, enabled)
                      }
                      aria-label={t("toggleTask", { title: task.title })}
                      disabled={
                        updatingTaskIds.has(task.id) ||
                        deletingTaskId === task.id
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPendingDeleteTask(task)}
                      aria-label={t("deleteTask", { title: task.title })}
                      disabled={deletingTaskId === task.id}
                    >
                      <Trash2Icon className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

