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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
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
                    frequency === DAILY_FREQUENCY
                      ? timeOfDay
                      : intervalMinutes
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
