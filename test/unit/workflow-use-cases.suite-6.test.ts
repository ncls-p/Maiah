import { beforeEach,describe,expect,it,vi } from "vitest";

const database = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "insert", "update", "from", "where", "orderBy", "limit", "values", "set", "returning", "innerJoin", "onConflictDoUpdate", "onConflictDoNothing"]) {
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
import { archiveWorkflow,failQueuedWorkflowRun,processWorkflowRun,publishWorkflow } from "@/modules/workflows/use-cases";

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
  database.db.transaction.mockReset().mockImplementation(async (callback) => callback(database.db));
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
  workflowMocks.nodeById.mockImplementation((currentDefinition: WorkflowDefinition, nodeId: string) => currentDefinition.nodes.find((item) => item.id === nodeId));
});

describe("workflow worker processing", () => {
  function record(status = "queued") {
    return {
      run: { ...run, status },
      version,
    };
  }

  it("persists every relevant node event and completes the run", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    database.chain.returning.mockResolvedValueOnce([{ ...run, status: "completed", outputJson: { result: true } }]);
    workflowMocks.createRuntime.mockImplementation(({ eventBus }) => ({
      run: vi.fn().mockImplementation(async () => {
        await eventBus.emit({
          type: "workflow:start",
          payload: {},
        });
        await eventBus.emit({
          type: "node:start",
          payload: { nodeId: "missing", input: null },
        });
        await eventBus.emit({
          type: "node:start",
          payload: { nodeId: "trigger", input: { name: "Ada" } },
        });
        await eventBus.emit({
          type: "node:retry",
          payload: { nodeId: "trigger", attempt: 1 },
        });
        await eventBus.emit({
          type: "node:finish",
          payload: { nodeId: "trigger", result: { output: { ok: true } } },
        });
        await eventBus.emit({
          type: "node:skipped",
          payload: { nodeId: "trigger" },
        });
        await eventBus.emit({
          type: "node:error",
          payload: { nodeId: "trigger", error: "failed" },
        });
        return { status: "completed", context: { result: true }, errors: [] };
      }),
    }));

    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "completed",
    });
    expect(database.db.insert).toHaveBeenCalled();
    expect(database.chain.onConflictDoUpdate).toHaveBeenCalled();
    expect(database.chain.set).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", error: null }));
  });

  it("fails only workflow runs that are still queued", async () => {
    database.chain.returning.mockResolvedValueOnce([{ ...run, status: "failed", error: "queue mismatch" }]);

    await expect(failQueuedWorkflowRun(run.id, "queue mismatch")).resolves.toMatchObject({
      status: "failed",
      error: "queue mismatch",
    });
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "queue mismatch",
      }),
    );
    expect(database.chain.where).toHaveBeenCalled();
  });
});
describe("workflow CRUD use cases", () => {
  it("publishes validated versions and archives scoped workflows", async () => {
    database.chain.limit.mockResolvedValueOnce([workflow]).mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([{ ...workflow, status: "active", activeVersion: 2 }]);
    await expect(publishWorkflow(workflow.id, workflow.workspaceId)).resolves.toMatchObject({ status: "active", activeVersion: 2 });
    expect(workflowMocks.compile).toHaveBeenCalledWith(expect.objectContaining({ workflowId: workflow.id, version: 2 }));

    database.chain.limit.mockResolvedValueOnce([workflow]);
    database.chain.returning.mockResolvedValueOnce([{ ...workflow, status: "archived" }]);
    await expect(archiveWorkflow(workflow.id, workflow.workspaceId)).resolves.toMatchObject({ status: "archived" });
  });
});
