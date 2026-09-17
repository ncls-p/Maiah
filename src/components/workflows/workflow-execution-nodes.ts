import type { WorkflowRunDetail } from "./types";
import type { WorkflowCanvasNodeType } from "./workflow-canvas-node";

export function workflowExecutionNodes(
  nodes: WorkflowCanvasNodeType[],
  run: WorkflowRunDetail | null,
): WorkflowCanvasNodeType[] {
  const terminal = run && !["queued", "running"].includes(run.status);
  const statuses = new Map(
    (run?.steps ?? []).map((step) => [
      step.nodeId,
      step.status === "running" && terminal
        ? run.status === "failed"
          ? ("failed" as const)
          : ("skipped" as const)
        : step.status,
    ]),
  );
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, executionStatus: statuses.get(node.id) },
  }));
}
