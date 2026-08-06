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
import { WorkflowConflictError,createWorkflowRun,getWorkflowDetail,listWorkflows } from "@/modules/workflows/use-cases";

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

describe("workflow run use cases", () => {
  it("requires a published version for API runs", async () => {
    database.chain.limit.mockResolvedValueOnce([{ ...workflow, activeVersion: null }]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(WorkflowConflictError);
  });

  it("returns an idempotent run without enqueueing again", async () => {
    database.chain.limit.mockResolvedValueOnce([workflow]).mockResolvedValueOnce([run]);
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
    database.chain.limit.mockResolvedValueOnce([workflow]).mockResolvedValueOnce([]).mockResolvedValueOnce([version]).mockResolvedValueOnce([concurrentRun]);
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
    database.chain.limit.mockResolvedValueOnce([workflow]).mockResolvedValueOnce([version]);
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
    database.chain.limit.mockResolvedValueOnce([workflow]).mockResolvedValueOnce([]).mockResolvedValueOnce([testedVersion]);
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
});
describe("workflow CRUD use cases", () => {
  it("lists active workflows and loads a parsed version", async () => {
    database.chain.orderBy.mockResolvedValueOnce([workflow]);
    await expect(listWorkflows("workspace-1")).resolves.toEqual([workflow]);

    database.chain.limit.mockResolvedValueOnce([workflow]).mockResolvedValueOnce([version]);
    await expect(getWorkflowDetail("workflow-1", "workspace-1")).resolves.toMatchObject({
      id: "workflow-1",
      version: 2,
      definition,
    });
  });
});
