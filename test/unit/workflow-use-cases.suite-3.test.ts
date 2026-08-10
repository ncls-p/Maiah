import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
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

const workflowMocks = vi.hoisted(() => ({
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

import type { WorkflowDefinition } from "@/modules/workflows/contracts";
import { createStarterDefinition } from "@/modules/workflows/contracts";
import {
  WorkflowConflictError,
  WorkflowNotFoundError,
  WorkflowQueueError,
  createWorkflowRun,
  getWorkflowDetail,
  getWorkflowRun,
  listQueuedWorkflowRunIds,
  listWorkflowRuns,
} from "@/modules/workflows/use-cases";

const definition = createStarterDefinition();
const workflow = {
  id: "workflow-1",
  workspaceId: "workspace-1",
  createdById: "user-1",
  name: "Automation",
  description: null,
  status: "draft",
  latestVersion: 2,
  activeVersion: 1,
};
const version = {
  id: "version-2",
  workflowId: workflow.id,
  version: 2,
  definitionJson: definition,
};
const run = {
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

describe("workflow run use cases", () => {
  it("handles missing versions, failed inserts, and queue outages", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(WorkflowConflictError);

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toThrow("Failed to create workflow run");

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([run]);
    workflowMocks.enqueue.mockRejectedValueOnce(
      new Error("queue unavailable".repeat(1_000)),
    );
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(WorkflowQueueError);
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.stringMatching(/^queue unavailable/),
      }),
    );
  });

  it("lists runs and returns their ordered steps", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([run]);
    await expect(
      listWorkflowRuns(workflow.id, workflow.workspaceId),
    ).resolves.toEqual([run]);

    const steps = [{ nodeId: "trigger", status: "completed" }];
    database.chain.limit.mockResolvedValueOnce([run]);
    database.chain.orderBy.mockResolvedValueOnce(steps);
    await expect(getWorkflowRun(run.id, workflow.workspaceId)).resolves.toEqual(
      {
        ...run,
        steps,
      },
    );

    database.chain.limit.mockResolvedValueOnce([]);
    await expect(
      getWorkflowRun("missing", workflow.workspaceId),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);
  });
});

describe("workflow worker processing", () => {
  it("lists queued identifiers for worker recovery", async () => {
    database.chain.limit.mockResolvedValueOnce([
      { id: "run-1" },
      { id: "run-2" },
    ]);
    await expect(listQueuedWorkflowRunIds()).resolves.toEqual([
      "run-1",
      "run-2",
    ]);
  });
});
describe("workflow CRUD use cases", () => {
  it("rejects missing, archived, and versionless workflows", async () => {
    database.chain.limit.mockResolvedValueOnce([]);
    await expect(
      getWorkflowDetail("missing", "workspace-1"),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);

    database.chain.limit.mockResolvedValueOnce([
      { ...workflow, status: "archived" },
    ]);
    await expect(
      getWorkflowDetail("workflow-1", "workspace-1"),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([]);
    await expect(
      getWorkflowDetail("workflow-1", "workspace-1"),
    ).rejects.toBeInstanceOf(WorkflowConflictError);
  });
});
