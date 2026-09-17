import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkflowBuilderViewModel } from "./workflow-builder.workflow-builder.view";
export function WorkflowRunStatusBar({
  model,
}: {
  model: WorkflowBuilderViewModel;
}) {
  const { t, nodes } = model;
  return (
    <>
      {model.runDetail ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex items-center gap-2" role="status">
            <Badge
              variant={
                model.runDetail.status === "failed"
                  ? "destructive"
                  : "secondary"
              }
            >
              {t(`status.${model.runDetail.status}`)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {model.runDetail.steps
                .filter(
                  (step) =>
                    model.runDetail?.status === "running" &&
                    step.status === "running",
                )
                .map(
                  (step) =>
                    nodes.find((node) => node.id === step.nodeId)?.data.label ??
                    step.nodeId,
                )
                .join(", ")}
            </span>
            {model.runDetailError ? (
              <span className="text-xs text-destructive">
                {model.runDetailError}
              </span>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => model.setRunDetailOpen(true)}
          >
            {t("followRun")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
