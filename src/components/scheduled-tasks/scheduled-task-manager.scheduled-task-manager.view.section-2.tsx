import {
  CalendarClockIcon,
  Loader2Icon,
  PlusIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";

import { PageEmptyState } from "@/components/page-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  formatNextRun,
  statusToneClass,
  statusVariant,
} from "./scheduled-task-manager.daily-frequency";
import type { ScheduledTaskManagerViewModel } from "./scheduled-task-manager.scheduled-task-manager.view";
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
