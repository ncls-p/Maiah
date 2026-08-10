import type {
  WorkflowDefinition,
  WorkflowNode,
} from "@/modules/workflows/contracts";

export type WorkflowSummary = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  latestVersion: number;
  activeVersion: number | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowDetail = WorkflowSummary & {
  version: number;
  definition: WorkflowDefinition;
};

export type WorkflowRun = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  queuedAt: string;
  completedAt: string | null;
  outputJson: unknown;
  error: string | null;
};

export type WorkflowRunStep = {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  attempt: number;
  inputJson: unknown;
  outputJson: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type WorkflowRunDetail = WorkflowRun & {
  inputJson: unknown;
  startedAt: string | null;
  steps: WorkflowRunStep[];
};

export type WorkflowCanvasData = {
  label: string;
  workflowType: WorkflowNode["type"];
  parameters: Record<string, unknown>;
  settings: WorkflowNode["settings"];
};
