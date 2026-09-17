import { useState } from "react";
import { fetchJson } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ToolPayloadViewer } from "@/components/tools/tool-payload-viewer";
import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { WorkflowBuilderViewModel } from "./workflow-builder.workflow-builder.view";
export function WorkflowBuilderSection1({
  model,
}: {
  model: WorkflowBuilderViewModel;
}) {
  const [cancelling, setCancelling] = useState(false);
  const {
    nodes,
    runDetail,
    runDetailLoading,
    runDetailOpen,
    requestedRunId,
    runDetailError,
    loadRunDetail,
    setRunInput,
    setRunSheetOpen,
    setRunDetailOpen,
    t,
  } = model;
  async function cancelRun() {
    if (!runDetail || cancelling) return;
    setCancelling(true);
    try {
      await fetchJson(`/api/workspace/workflow-runs/${runDetail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: model.workspaceId,
          status: "cancelled",
        }),
      });
      await loadRunDetail(runDetail.id);
      await model.loadRuns();
    } catch {
      toast.error(t("cancelFailed"));
    } finally {
      setCancelling(false);
    }
  }
  return (
    <Sheet
      open={runDetailOpen}
      onOpenChange={(open) => {
        setRunDetailOpen(open);
      }}
    >
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("runDetailTitle")}</SheetTitle>
          <SheetDescription>
            {runDetail
              ? `${runDetail.id.slice(0, 8)} · ${t(`status.${runDetail.status}`)}`
              : t("loading")}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-5 pb-5">
          {runDetailError ? (
            <Alert variant="destructive">
              <AlertDescription>{runDetailError}</AlertDescription>
              {requestedRunId ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    requestedRunId && void loadRunDetail(requestedRunId)
                  }
                >
                  {t("refreshRuns")}
                </Button>
              ) : null}
            </Alert>
          ) : null}
          {runDetailLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : runDetail ? (
            <div className="flex flex-col gap-4">
              <div
                className="flex items-center justify-between gap-2"
                aria-live="polite"
              >
                <Badge
                  variant={
                    runDetail.status === "failed" ? "destructive" : "secondary"
                  }
                >
                  {t(`status.${runDetail.status}`)}
                </Badge>
                {["queued", "running"].includes(runDetail.status) &&
                model.canExecute ? (
                  <Button
                    variant="outline"
                    disabled={cancelling}
                    onClick={() => void cancelRun()}
                  >
                    {t("cancelRun")}
                  </Button>
                ) : null}
                {model.canExecute &&
                !["queued", "running"].includes(runDetail.status) ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRunInput(
                        JSON.stringify(runDetail.inputJson ?? {}, null, 2),
                      );
                      setRunDetailOpen(false);
                      setRunSheetOpen(true);
                    }}
                  >
                    {t("retryRun")}
                  </Button>
                ) : null}
              </div>
              {runDetail.error ? (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>{t("error")}</AlertTitle>
                  <AlertDescription className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                    {runDetail.error}
                  </AlertDescription>
                </Alert>
              ) : null}
              {runDetail.steps.map((step) => (
                <div
                  key={step.nodeId}
                  className="rounded-xl border border-border/75 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {nodes.find((node) => node.id === step.nodeId)?.data
                        .label ?? step.nodeId}
                    </span>
                    <Badge
                      variant={
                        step.status === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {t(`stepStatus.${step.status}`)}
                    </Badge>
                  </div>
                  {step.error ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-destructive/10 p-3 font-mono text-xs text-destructive">
                      {step.error}
                    </pre>
                  ) : null}
                  <div className="mt-3 grid gap-3">
                    <ToolPayloadViewer
                      label={t("stepInput")}
                      value={step.inputJson}
                    />
                    {step.outputJson !== undefined ? (
                      <ToolPayloadViewer
                        label={t("stepOutput")}
                        value={step.outputJson}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
              {runDetail.outputJson !== null &&
              runDetail.outputJson !== undefined ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t("output")}</h3>
                  <pre className="max-h-72 overflow-auto rounded-xl bg-muted p-3 text-xs leading-5">
                    {JSON.stringify(runDetail.outputJson, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
