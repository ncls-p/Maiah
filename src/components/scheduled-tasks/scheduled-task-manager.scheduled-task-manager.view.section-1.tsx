import { Loader2Icon,PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DAILY_FREQUENCY,ScheduleFrequency } from "./scheduled-task-manager.daily-frequency";
import type { ScheduledTaskManagerViewModel } from "./scheduled-task-manager.scheduled-task-manager.view";
export function ScheduledTaskManagerSection1({ model }: { model: ScheduledTaskManagerViewModel }) {
  const { agents, createOpen, createTask, currentAgentId, frequency, intervalMinutes, loadError, prompt, saving, setAgentId, setCreateOpen, setFrequency, setIntervalMinutes, setPrompt, setTimeOfDay, setTitle, t, tCommon, timeOfDay, title, workspaceId } = model;
  return (
    <Dialog
      open={createOpen}
      onOpenChange={(open) => {
        if (!saving) setCreateOpen(open);
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label htmlFor="scheduled-task-title">{t("fields.title")}</Label>
            <Input id="scheduled-task-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scheduled-task-prompt">{t("fields.prompt")}</Label>
            <Textarea id="scheduled-task-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} />
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
              <Select value={frequency} onValueChange={(value) => setFrequency(value as ScheduleFrequency)}>
                <SelectTrigger aria-label={t("fields.frequency")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DAILY_FREQUENCY}>{t("frequency.daily")}</SelectItem>
                  <SelectItem value="interval">{t("frequency.interval")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scheduled-task-schedule">{frequency === DAILY_FREQUENCY ? t("fields.time") : t("fields.minutes")}</Label>
              <Input id="scheduled-task-schedule" type={frequency === DAILY_FREQUENCY ? "time" : "number"} min={frequency === DAILY_FREQUENCY ? undefined : 5} value={frequency === DAILY_FREQUENCY ? timeOfDay : intervalMinutes} onChange={(event) => (frequency === DAILY_FREQUENCY ? setTimeOfDay(event.target.value) : setIntervalMinutes(event.target.value))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void createTask()} disabled={saving || loadError || !workspaceId || !currentAgentId || !title.trim() || !prompt.trim()}>
            {saving ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : <PlusIcon className="size-4" aria-hidden="true" />}
            {t("create.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
