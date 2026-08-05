"use client";

import { useLocale,useTranslations } from "next-intl";
import { useCallback,useEffect,useMemo,useState } from "react";
import { toast } from "sonner";

import type { ChatAgent } from "@/components/chat/chat-types";
import { fetchJson } from "@/lib/api-client";
import { DAILY_FREQUENCY,ScheduleFrequency,ScheduledTask,localTimeZone } from "./scheduled-task-manager.daily-frequency";
import { ScheduledTaskManagerView } from "./scheduled-task-manager.scheduled-task-manager.view";

export function useScheduledTaskManagerController({ workspaceId, agents }: { workspaceId: string | null; agents: ChatAgent[] }) {
  const locale = useLocale();
  const t = useTranslations("scheduledTasks");
  const tCommon = useTranslations("common");
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState(t("defaults.title"));
  const [prompt, setPrompt] = useState(t("defaults.prompt"));
  const [frequency, setFrequency] = useState<ScheduleFrequency>(DAILY_FREQUENCY);
  const [timeOfDay, setTimeOfDay] = useState("08:00");
  const [intervalMinutes, setIntervalMinutes] = useState("1440");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [pendingDeleteTask, setPendingDeleteTask] = useState<ScheduledTask | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(() => new Set());

  const currentAgentId = useMemo(() => agentId || agents[0]?.id || "", [agentId, agents]);
  const enabledTasks = tasks.filter((task) => task.enabled).length;
  const successfulTasks = tasks.filter((task) => task.lastStatus === "success").length;
  const successRate = tasks.length > 0 ? Math.round((successfulTasks / tasks.length) * 100) : 0;
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
      const data = await fetchJson<{ tasks: ScheduledTask[] }>(`/api/workspace/scheduled-tasks?workspaceId=${workspaceId}`);
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

  async function createTask() {
    const trimmedTitle = title.trim();
    const trimmedPrompt = prompt.trim();
    if (!workspaceId) return;
    if (!currentAgentId) return;
    if (!trimmedTitle) return;
    if (!trimmedPrompt) return;
    setSaving(true);
    try {
      const data = await fetchJson<{ task: ScheduledTask }>("/api/workspace/scheduled-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          agentId: currentAgentId,
          conversationId: null,
          title: trimmedTitle,
          prompt: trimmedPrompt,
          frequency,
          timezone: localTimeZone(),
          timeOfDay: frequency === DAILY_FREQUENCY ? timeOfDay : null,
          intervalMinutes: frequency === "interval" ? Number(intervalMinutes) : null,
        }),
      });
      setTasks((current) => [data.task, ...current]);
      setCreateOpen(false);
      toast.success(t("toasts.created"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.createFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task: ScheduledTask, enabled: boolean) {
    if (!workspaceId || updatingTaskIds.has(task.id)) return;
    setUpdatingTaskIds((current) => new Set(current).add(task.id));
    try {
      const data = await fetchJson<{ task: ScheduledTask }>(`/api/workspace/scheduled-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, enabled }),
      });
      setTasks((current) => current.map((item) => (item.id === task.id ? data.task : item)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.updateFailed"));
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
      await fetchJson(`/api/workspace/scheduled-tasks/${task.id}?workspaceId=${workspaceId}`, { method: "DELETE" });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setPendingDeleteTask(null);
      toast.success(t("toasts.deleted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.deleteFailed"));
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
    createOpen,
    createTask,
    currentAgentId,
    deleteTask,
    deletingTaskId,
    enabledTasks,
    formatFrequency,
    frequency,
    intervalMinutes,
    loadError,
    loadTasks,
    loading,
    locale,
    nextTask,
    pendingDeleteTask,
    prompt,
    saving,
    setAgentId,
    setCreateOpen,
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

export function ScheduledTaskManager(...args: Parameters<typeof useScheduledTaskManagerController>) {
  const model = useScheduledTaskManagerController(...args);
  if (!("kind" in model)) return model;
  return <ScheduledTaskManagerView model={model} />;
}
