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
import { WorkflowNotFoundError,createWorkflow,processWorkflowRun } from "@/modules/workflows/use-cases";

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

  it("rejects missing records and skips terminal runs", async () => {
    database.chain.limit.mockResolvedValueOnce([]);
    await expect(processWorkflowRun("missing")).rejects.toBeInstanceOf(WorkflowNotFoundError);

    database.chain.limit.mockResolvedValueOnce([record("completed")]);
    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "completed",
    });
    expect(workflowMocks.compile).not.toHaveBeenCalled();

    database.chain.limit.mockResolvedValueOnce([record("cancelled")]);
    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "cancelled",
    });
  });

  it("persists runtime failure results and thrown errors", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    database.chain.returning.mockResolvedValueOnce([{ ...run, status: "failed", error: "node failed" }]);
    workflowMocks.createRuntime.mockReturnValueOnce({
      run: vi.fn().mockResolvedValue({
        status: "failed",
        context: {},
        errors: [new Error("node failed")],
      }),
    });
    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "failed",
    });
    expect(database.chain.set).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error: "node failed" }));

    database.chain.limit.mockResolvedValueOnce([record()]);
    workflowMocks.createRuntime.mockReturnValueOnce({
      run: vi.fn().mockRejectedValue(new Error("runtime exploded")),
    });
    await expect(processWorkflowRun(run.id)).rejects.toThrow("runtime exploded");
    expect(database.chain.set).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error: "runtime exploded" }));
  });

  it("persists compilation failures before the runtime starts", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    workflowMocks.compile.mockImplementationOnce(() => {
      throw new Error("invalid workflow graph");
    });

    await expect(processWorkflowRun(run.id)).rejects.toThrow("invalid workflow graph");
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "invalid workflow graph",
      }),
    );
    expect(workflowMocks.createRuntime).not.toHaveBeenCalled();
  });
});
describe("workflow CRUD use cases", () => {
  it("creates the workflow and its initial version transactionally", async () => {
    database.chain.returning.mockResolvedValueOnce([workflow]);
    await expect(
      createWorkflow({
        workspaceId: "workspace-1",
        userId: "user-1",
        name: "Automation",
      }),
    ).resolves.toMatchObject({ version: 1, definition });
    expect(database.db.transaction).toHaveBeenCalled();
    expect(database.chain.values).toHaveBeenCalledWith(expect.objectContaining({ description: null }));

    database.chain.returning.mockResolvedValueOnce([]);
    await expect(
      createWorkflow({
        workspaceId: "workspace-1",
        userId: "user-1",
        name: "Missing",
        description: "Description",
      }),
    ).rejects.toThrow("Failed to create workflow");
  });
});
