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
import { WorkflowNotFoundError,processWorkflowRun,updateWorkflow } from "@/modules/workflows/use-cases";

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

  it("persists the underlying node error instead of only the runtime wrapper", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    database.chain.returning.mockResolvedValueOnce([{ ...run, status: "failed" }]);
    const sandboxError = new Error("Sandbox execution failed (exit code 1): SyntaxError: Unexpected token");
    const wrappedError = new Error("Node 'trigger' execution failed", {
      cause: sandboxError,
    });
    workflowMocks.createRuntime.mockImplementation(({ eventBus }) => ({
      run: vi.fn().mockImplementation(async () => {
        await eventBus.emit({
          type: "node:start",
          payload: { nodeId: "trigger", input: { body: "rss" } },
        });
        await eventBus.emit({
          type: "node:error",
          payload: { nodeId: "trigger", error: wrappedError },
        });
        return {
          status: "failed",
          context: {},
          errors: [wrappedError],
        };
      }),
    }));

    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "failed",
    });
    const storedErrors = database.chain.set.mock.calls.map(([value]) => (value as { error?: string }).error).filter(Boolean);
    expect(storedErrors).toEqual(expect.arrayContaining([expect.stringContaining("SyntaxError: Unexpected token")]));
    expect(storedErrors).toEqual(expect.arrayContaining([expect.stringContaining("Node 'trigger' execution failed")]));
  });
});
describe("workflow CRUD use cases", () => {
  it("updates definitions and metadata, including the existing definition fallback", async () => {
    const updated = { ...workflow, name: "Updated", latestVersion: 3 };
    database.chain.limit.mockResolvedValueOnce([workflow]);
    database.chain.returning.mockResolvedValueOnce([updated]);
    await expect(
      updateWorkflow({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        name: "Updated",
        description: "New description",
        definition,
      }),
    ).resolves.toMatchObject({
      name: "Updated",
      version: 3,
      definition,
    });
    expect(database.db.update.mock.invocationCallOrder[0]).toBeLessThan(database.db.insert.mock.invocationCallOrder[0]!);
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated",
        description: "New description",
        status: "draft",
        latestVersion: expect.anything(),
      }),
    );

    database.chain.limit.mockResolvedValueOnce([workflow]).mockResolvedValueOnce([{ definitionJson: version.definitionJson }]);
    database.chain.returning.mockResolvedValueOnce([workflow]);
    await expect(
      updateWorkflow({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).resolves.toMatchObject({ version: 2, definition });

    database.chain.limit.mockResolvedValueOnce([workflow]);
    database.chain.returning.mockResolvedValueOnce([]);
    await expect(
      updateWorkflow({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        name: "Gone",
      }),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);
  });
});
