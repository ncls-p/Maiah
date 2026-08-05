import { AlertCircleIcon } from "lucide-react";

import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle } from "@/components/ui/sheet";

import type { WorkflowBuilderViewModel } from "./workflow-builder.workflow-builder.view";
export function WorkflowBuilderSection1({ model }: { model: WorkflowBuilderViewModel }) {
  const { nodes, runDetail, runDetailLoading, runDetailOpen, setRunDetail, setRunDetailOpen, t } = model;
  return (
    <Sheet
      open={runDetailOpen}
      onOpenChange={(open) => {
        setRunDetailOpen(open);
        if (!open) setRunDetail(null);
      }}
    >
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("runDetailTitle")}</SheetTitle>
          <SheetDescription>{runDetail ? `${runDetail.id.slice(0, 8)} · ${t(`status.${runDetail.status}`)}` : t("loading")}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-5 pb-5">
          {runDetailLoading || !runDetail ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {runDetail.error ? (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>{t("error")}</AlertTitle>
                  <AlertDescription className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{runDetail.error}</AlertDescription>
                </Alert>
              ) : null}
              {runDetail.steps.map((step) => (
                <div key={step.nodeId} className="rounded-xl border border-border/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{nodes.find((node) => node.id === step.nodeId)?.data.label ?? step.nodeId}</span>
                    <Badge variant={step.status === "failed" ? "destructive" : "secondary"}>{t(`stepStatus.${step.status}`)}</Badge>
                  </div>
                  {step.error ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-destructive/10 p-3 font-mono text-xs text-destructive">{step.error}</pre> : null}
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("stepInput")}</p>
                      <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5">{JSON.stringify(step.inputJson, null, 2)}</pre>
                    </div>
                    {step.outputJson !== null && step.outputJson !== undefined ? (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("stepOutput")}</p>
                        <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5">{JSON.stringify(step.outputJson, null, 2)}</pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {runDetail.outputJson !== null && runDetail.outputJson !== undefined ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t("output")}</h3>
                  <pre className="max-h-72 overflow-auto rounded-xl bg-muted p-3 text-xs leading-5">{JSON.stringify(runDetail.outputJson, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
