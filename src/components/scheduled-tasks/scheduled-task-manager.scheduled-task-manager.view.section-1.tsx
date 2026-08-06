import { Loader2Icon, PlusIcon, SaveIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DAILY_FREQUENCY,
  ScheduleFrequency,
  formatNextRun,
  statusToneClass,
  statusVariant,
} from "./scheduled-task-manager.daily-frequency";
import type { ScheduledTaskManagerViewModel } from "./scheduled-task-manager.scheduled-task-manager.view";
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
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(editingTask ? "edit.title" : "create.title")}
          </DialogTitle>
          <DialogDescription>
            {t(editingTask ? "edit.description" : "create.description")}
          </DialogDescription>
        </DialogHeader>
        {editingTask ? (
          <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 text-sm sm:grid-cols-2">
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
        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label htmlFor="scheduled-task-title">{t("fields.title")}</Label>
            <Input
              id="scheduled-task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scheduled-task-prompt">{t("fields.prompt")}</Label>
            <Textarea
              id="scheduled-task-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-3 xl:col-span-1">
              <Label>{t("fields.assistant")}</Label>
              <Select value={currentAgentId} onValueChange={setAgentId}>
                <SelectTrigger aria-label={t("fields.assistant")}>
                  <SelectValue placeholder={t("fields.assistantPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("fields.frequency")}</Label>
              <Select
                value={frequency}
                onValueChange={(value) =>
                  setFrequency(value as ScheduleFrequency)
                }
              >
                <SelectTrigger aria-label={t("fields.frequency")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DAILY_FREQUENCY}>
                    {t("frequency.daily")}
                  </SelectItem>
                  <SelectItem value="interval">
                    {t("frequency.interval")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scheduled-task-schedule">
                {frequency === DAILY_FREQUENCY
                  ? t("fields.time")
                  : t("fields.minutes")}
              </Label>
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
            </div>
          </div>
          {editingTask ? (
            <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-3">
              <div>
                <Label htmlFor="scheduled-task-enabled">
                  {t("fields.enabled")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("edit.enabledHint")}
                </p>
              </div>
              <Switch
                id="scheduled-task-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
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
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            ) : editingTask ? (
              <SaveIcon className="size-4" aria-hidden="true" />
            ) : (
              <PlusIcon className="size-4" aria-hidden="true" />
            )}
            {t(editingTask ? "edit.submit" : "create.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
