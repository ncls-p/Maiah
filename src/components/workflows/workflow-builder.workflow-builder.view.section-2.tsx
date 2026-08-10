import {
  BotIcon,
  Maximize2Icon,
  Minimize2Icon,
  MousePointer2Icon,
  PanelLeftIcon,
  PanelRightIcon,
  PlayIcon,
  RefreshCwIcon,
  RocketIcon,
  SaveIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { WorkflowBuilderViewModel } from "./workflow-builder.workflow-builder.view";
export function WorkflowBuilderSection2({
  model,
}: {
  model: WorkflowBuilderViewModel;
}) {
  const {
    actionBusy,
    agenticRunning,
    editorMode,
    isFullscreen,
    publish,
    publishing,
    save,
    saving,
    setEditorMode,
    setInspectorOpen,
    setIsFullscreen,
    setPaletteOpen,
    setRunSheetOpen,
    setWorkflow,
    t,
    workflow,
  } = model;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border/70 px-3 py-3 sm:gap-3 sm:px-4">
      <div className="min-w-44 flex-1 sm:min-w-56">
        <Input
          value={workflow.name}
          onChange={(event) =>
            setWorkflow((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          aria-label={t("workflowName")}
          className="h-8 max-w-md border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:border-border"
        />
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Badge
            variant={workflow.status === "active" ? "default" : "secondary"}
          >
            {workflow.status === "active" ? t("active") : t("draft")}
          </Badge>
          <span>{t("version", { version: workflow.latestVersion })}</span>
          {workflow.activeVersion ? (
            <span>· API v{workflow.activeVersion}</span>
          ) : null}
        </div>
      </div>
      <div
        className="flex items-center rounded-lg border border-border/75 bg-muted/40 p-0.5"
        role="group"
        aria-label={t("mode")}
      >
        <Button
          type="button"
          variant={editorMode === "visual" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-1.5 shadow-none sm:px-2.5"
          aria-pressed={editorMode === "visual"}
          disabled={agenticRunning}
          onClick={() => setEditorMode("visual")}
        >
          <MousePointer2Icon data-icon="inline-start" />
          {t("visualMode")}
        </Button>
        <Button
          type="button"
          variant={editorMode === "agentic" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-1.5 shadow-none sm:px-2.5"
          aria-pressed={editorMode === "agentic"}
          disabled={agenticRunning}
          onClick={() => setEditorMode("agentic")}
        >
          <BotIcon data-icon="inline-start" />
          {t("agenticMode")}
        </Button>
      </div>
      {editorMode === "visual" ? (
        <>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t("openPalette")}
            onClick={() => setPaletteOpen(true)}
          >
            <PanelLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t("openInspector")}
            onClick={() => setInspectorOpen(true)}
          >
            <PanelRightIcon />
          </Button>
        </>
      ) : null}
      <Button
        variant="outline"
        size="icon"
        aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
        aria-pressed={isFullscreen}
        onClick={() => setIsFullscreen((current) => !current)}
      >
        <span className="relative size-4">
          <Minimize2Icon
            className={cn(
              "absolute inset-0 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              isFullscreen
                ? "scale-100 opacity-100 blur-0"
                : "scale-[0.25] opacity-0 blur-[4px]",
            )}
          />
          <Maximize2Icon
            className={cn(
              "transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              isFullscreen
                ? "scale-[0.25] opacity-0 blur-[4px]"
                : "scale-100 opacity-100 blur-0",
            )}
          />
        </span>
      </Button>
      <Button
        variant="outline"
        onClick={() => void save()}
        disabled={actionBusy}
        className="max-sm:px-3"
      >
        {saving ? (
          <RefreshCwIcon data-icon="inline-start" className="animate-spin" />
        ) : (
          <SaveIcon data-icon="inline-start" />
        )}
        <span className="max-sm:sr-only">
          {saving ? t("saving") : t("save")}
        </span>
      </Button>
      <Button
        variant="outline"
        onClick={() => setRunSheetOpen(true)}
        disabled={actionBusy}
        className="max-sm:px-3"
      >
        <PlayIcon data-icon="inline-start" />
        <span className="max-sm:sr-only">{t("run")}</span>
      </Button>
      <Button
        onClick={() => void publish()}
        disabled={actionBusy}
        className="max-sm:px-3"
      >
        {publishing ? (
          <RefreshCwIcon data-icon="inline-start" className="animate-spin" />
        ) : (
          <RocketIcon data-icon="inline-start" />
        )}
        <span className="max-sm:sr-only">
          {publishing ? t("publishing") : t("publish")}
        </span>
      </Button>
    </div>
  );
}
