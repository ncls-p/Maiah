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

describe("workflow CRUD use cases", () => {
  it("lists active workflows and loads a parsed version", async () => {
    database.chain.orderBy.mockResolvedValueOnce([workflow]);
    await expect(listWorkflows("workspace-1")).resolves.toEqual([workflow]);

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    await expect(
      getWorkflowDetail("workflow-1", "workspace-1"),
    ).resolves.toMatchObject({
      id: "workflow-1",
      version: 2,
      definition,
    });
  });

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
    expect(database.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );

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
    expect(database.db.update.mock.invocationCallOrder[0]).toBeLessThan(
      database.db.insert.mock.invocationCallOrder[0]!,
    );
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated",
        description: "New description",
        status: "draft",
        latestVersion: expect.anything(),
      }),
    );

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([{ definitionJson: version.definitionJson }]);
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

  it("publishes validated versions and archives scoped workflows", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([
      { ...workflow, status: "active", activeVersion: 2 },
    ]);
    await expect(
      publishWorkflow(workflow.id, workflow.workspaceId),
    ).resolves.toMatchObject({ status: "active", activeVersion: 2 });
    expect(workflowMocks.compile).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: workflow.id, version: 2 }),
    );

    database.chain.limit.mockResolvedValueOnce([workflow]);
    database.chain.returning.mockResolvedValueOnce([
      { ...workflow, status: "archived" },
    ]);
    await expect(
      archiveWorkflow(workflow.id, workflow.workspaceId),
    ).resolves.toMatchObject({ status: "archived" });
  });
});

describe("workflow run use cases", () => {
  it("requires a published version for API runs", async () => {
    database.chain.limit.mockResolvedValueOnce([
      { ...workflow, activeVersion: null },
    ]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(WorkflowConflictError);
  });

  it("returns an idempotent run without enqueueing again", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([run]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        idempotencyKey: "same-request",
      }),
    ).resolves.toBe(run);
    expect(workflowMocks.enqueue).not.toHaveBeenCalled();
  });

  it("recovers a concurrent idempotent run insert without enqueueing twice", async () => {
    const concurrentRun = { ...run, idempotencyKey: "same-request" };
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([version])
      .mockResolvedValueOnce([concurrentRun]);
    database.chain.returning.mockResolvedValueOnce([]);

    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        idempotencyKey: "same-request",
      }),
    ).resolves.toBe(concurrentRun);
    expect(workflowMocks.enqueue).not.toHaveBeenCalled();
  });

  it("creates and enqueues published and draft runs", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([run]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        payload: { name: "Ada" },
        useLatestDraft: true,
      }),
    ).resolves.toBe(run);
    expect(workflowMocks.enqueue).toHaveBeenCalledWith(run.id);
    expect(database.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        inputJson: { name: "Ada" },
        idempotencyKey: null,
      }),
    );
  });

  it("pins agent-approved runs to the exact tested version", async () => {
    const testedVersion = { ...version, version: 3, id: "version-3" };
    const agentRun = {
      ...run,
      workflowVersionId: testedVersion.id,
      trigger: "agent",
    };
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([testedVersion]);
    database.chain.returning.mockResolvedValueOnce([agentRun]);

    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        payload: { message: "Test" },
        versionNumber: 3,
        trigger: "agent",
        idempotencyKey: "workflow-agent-run:request-1",
      }),
    ).resolves.toBe(agentRun);
    expect(database.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowVersionId: testedVersion.id,
        trigger: "agent",
        idempotencyKey: "workflow-agent-run:request-1",
      }),
    );
  });

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
  function record(status = "queued") {
    return {
      run: { ...run, status },
      version,
    };
  }

  it("rejects missing records and skips terminal runs", async () => {
    database.chain.limit.mockResolvedValueOnce([]);
    await expect(processWorkflowRun("missing")).rejects.toBeInstanceOf(
      WorkflowNotFoundError,
    );

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

  it("persists every relevant node event and completes the run", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    database.chain.returning.mockResolvedValueOnce([
      { ...run, status: "completed", outputJson: { result: true } },
    ]);
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
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", error: null }),
    );
  });

  it("persists runtime failure results and thrown errors", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    database.chain.returning.mockResolvedValueOnce([
      { ...run, status: "failed", error: "node failed" },
    ]);
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
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "node failed" }),
    );

    database.chain.limit.mockResolvedValueOnce([record()]);
    workflowMocks.createRuntime.mockReturnValueOnce({
      run: vi.fn().mockRejectedValue(new Error("runtime exploded")),
    });
    await expect(processWorkflowRun(run.id)).rejects.toThrow(
      "runtime exploded",
    );
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "runtime exploded" }),
    );
  });

  it("persists compilation failures before the runtime starts", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    workflowMocks.compile.mockImplementationOnce(() => {
      throw new Error("invalid workflow graph");
    });

    await expect(processWorkflowRun(run.id)).rejects.toThrow(
      "invalid workflow graph",
    );
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "invalid workflow graph",
      }),
    );
    expect(workflowMocks.createRuntime).not.toHaveBeenCalled();
  });

  it("fails only workflow runs that are still queued", async () => {
    database.chain.returning.mockResolvedValueOnce([
      { ...run, status: "failed", error: "queue mismatch" },
    ]);

    await expect(
      failQueuedWorkflowRun(run.id, "queue mismatch"),
    ).resolves.toMatchObject({
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
