import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterDefinition } from "@/modules/workflows/contracts";
import type { WorkflowDefinition } from "@/modules/workflows/contracts";
import {
  WorkflowConflictError,
  WorkflowNotFoundError,
  WorkflowQueueError,
  archiveWorkflow,
  createWorkflow,
  createWorkflowRun,
  failQueuedWorkflowRun,
  getWorkflowDetail,
  getWorkflowRun,
  listQueuedWorkflowRunIds,
  listWorkflowRuns,
  listWorkflows,
  processWorkflowRun,
  publishWorkflow,
  updateWorkflow,
} from "@/modules/workflows/use-cases";

export const database = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "from",
    "where",
    "orderBy",
    "limit",
    "values",
    "set",
    "returning",
    "innerJoin",
    "onConflictDoUpdate",
    "onConflictDoNothing",
  ]) {
    chain[method] = vi.fn();
  }
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  };
  return { chain, db };
});

export const workflowMocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  compile: vi.fn(),
  createEventBus: vi.fn(),
  createRuntime: vi.fn(),
  nodeById: vi.fn(),
}));

vi.mock("@/server/infrastructure/db", () => ({ db: database.db }));
vi.mock("@/modules/workflows/queue", () => ({
  enqueueWorkflowRun: workflowMocks.enqueue,
}));
vi.mock("@/modules/workflows/runtime", () => ({
  compileWorkflowDefinition: workflowMocks.compile,
  createWorkflowEventBus: workflowMocks.createEventBus,
  createWorkflowRuntime: workflowMocks.createRuntime,
  workflowNodeById: workflowMocks.nodeById,
}));

export const definition = createStarterDefinition();
export const workflow = {
  id: "workflow-1",
  workspaceId: "workspace-1",
  createdById: "user-1",
  name: "Automation",
  description: null,
  status: "draft",
  latestVersion: 2,
  activeVersion: 1,
};
export const version = {
  id: "version-2",
  workflowId: workflow.id,
  version: 2,
  definitionJson: definition,
};
export const run = {
  id: "run-1",
  workspaceId: workflow.workspaceId,
  workflowId: workflow.id,
  workflowVersionId: version.id,
  triggeredById: "user-1",
  status: "queued",
  inputJson: { name: "Ada" },
};

function resetDatabase() {
  for (const method of ["select", "insert", "update"] as const) {
    database.db[method].mockReset().mockReturnValue(database.chain);
  }
  database.db.transaction
    .mockReset()
    .mockImplementation(async (callback) => callback(database.db));
  for (const [method, mock] of Object.entries(database.chain)) {
    mock.mockReset();
    if (method === "limit" || method === "returning") {
      mock.mockResolvedValue([]);
    } else {
      mock.mockReturnValue(database.chain);
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDatabase();
  workflowMocks.enqueue.mockResolvedValue(undefined);
  workflowMocks.compile.mockReturnValue({
    definition,
    blueprint: { id: "workflow-1@2", nodes: [], edges: [] },
  });
  workflowMocks.createEventBus.mockImplementation((emit) => ({ emit }));
  workflowMocks.createRuntime.mockReturnValue({
    run: vi.fn().mockResolvedValue({
      status: "completed",
      context: { result: true },
      errors: [],
    }),
  });
  workflowMocks.nodeById.mockImplementation(
    (currentDefinition: WorkflowDefinition, nodeId: string) =>
      currentDefinition.nodes.find((item) => item.id === nodeId),
  );
});
