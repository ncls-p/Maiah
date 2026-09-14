import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  get: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  process: vi.fn(),
  reserve: vi.fn(),
}));
vi.mock("@/modules/auth/workspace-access", () => ({
  hasResourcePermissionForRequest: mocks.permission,
}));
vi.mock("@/modules/workflows/use-cases", () => ({
  getWorkflowRun: mocks.get,
  getWorkflowDetail: mocks.detail,
  createWorkflowRun: mocks.create,
  processWorkflowRun: mocks.process,
}));
vi.mock("@/server/infrastructure/db", () => ({
  db: {
    update: () => ({
      set: () => ({ where: () => ({ returning: mocks.reserve }) }),
    }),
  },
}));
import { executeNestedWorkflow } from "@/modules/workflows/nested-execution";
import { createStarterDefinition } from "@/modules/workflows/contracts";
import {
  compileWorkflowDefinition,
  createWorkflowRuntime,
} from "@/modules/workflows/runtime";
const childId = "11111111-1111-4111-8111-111111111111";
const input = {
  workspaceId: "space",
  userId: "user",
  workflowId: "parent",
  runId: "run",
  nodeId: "child",
  targetWorkflowId: childId,
  input: { quantity: 3 },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue(true);
  mocks.get.mockResolvedValue({
    id: "run",
    workflowId: "parent",
    parentRunId: null,
  });
  mocks.detail.mockResolvedValue({ activeVersion: 2 });
  mocks.reserve.mockResolvedValue([{ id: "run" }]);
  mocks.create.mockResolvedValue({ id: "child-run" });
  mocks.process.mockResolvedValue({
    status: "completed",
    outputJson: { finish: { answer: 42 } },
  });
});
it("runs the published child inline as its initiator and returns its output", async () => {
  expect(await executeNestedWorkflow(input)).toEqual({
    workflowId: childId,
    runId: "child-run",
    output: { finish: { answer: 42 } },
  });
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: "space",
      userId: "user",
      payload: { quantity: 3 },
      parentRunId: "run",
      inline: true,
      useLatestDraft: false,
      idempotencyKey: "workflow:run:child",
    }),
  );
});
it("rejects unavailable permission before starting a child", async () => {
  mocks.permission.mockResolvedValue(false);
  await expect(executeNestedWorkflow(input)).rejects.toThrow("permission");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("requires a published child", async () => {
  mocks.detail.mockResolvedValue({ activeVersion: null });
  await expect(executeNestedWorkflow(input)).rejects.toThrow("Publish");
  expect(mocks.reserve).not.toHaveBeenCalled();
});
it("rejects indirect circular calls", async () => {
  mocks.get
    .mockResolvedValueOnce({
      id: "run",
      workflowId: "parent",
      parentRunId: "ancestor",
    })
    .mockResolvedValueOnce({
      id: "ancestor",
      workflowId: childId,
      parentRunId: null,
    });
  await expect(executeNestedWorkflow(input)).rejects.toThrow("Circular");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("bounds depth and detects malformed ancestor loops", async () => {
  mocks.get.mockImplementation(async (id: string) => ({
    id,
    workflowId: id,
    parentRunId: `${id}-parent`,
  }));
  await expect(executeNestedWorkflow(input)).rejects.toThrow("depth limit");
  mocks.get.mockResolvedValue({
    id: "run",
    workflowId: "parent",
    parentRunId: "run",
  });
  await expect(executeNestedWorkflow(input)).rejects.toThrow("depth limit");
});
it("bounds the total child runs atomically", async () => {
  mocks.reserve.mockResolvedValue([]);
  await expect(executeNestedWorkflow(input)).rejects.toThrow("20 child runs");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("propagates child failures without retrying", async () => {
  mocks.process.mockResolvedValue({
    status: "failed",
    error: "Remote service denied operation",
  });
  await expect(executeNestedWorkflow(input)).rejects.toThrow(
    "child-run failed: Remote service denied operation",
  );
  expect(mocks.create).toHaveBeenCalledTimes(1);
  mocks.process.mockResolvedValue({ status: "running" });
  await expect(executeNestedWorkflow(input)).rejects.toThrow(
    "execution did not complete",
  );
});
it("honors cancellation before dispatch and passes the parent signal", async () => {
  await expect(
    executeNestedWorkflow({ ...input, signal: AbortSignal.abort() }),
  ).rejects.toThrow();
  expect(mocks.create).not.toHaveBeenCalled();
  const signal = new AbortController().signal;
  await executeNestedWorkflow({ ...input, signal });
  expect(mocks.process).toHaveBeenCalledWith("child-run", { signal });
});
it("resolves typed values in a real graph and rejects automatic retries", async () => {
  const definition = createStarterDefinition();
  definition.nodes.push({
    id: "child",
    type: "workflow.run",
    label: "Child",
    position: { x: 200, y: 0 },
    parameters: {
      workflowId: childId,
      input: { quantity: "{{quantity}}" },
      outputPath: "childResult",
    },
    settings: { timeoutMs: 30000, maxRetries: 0, retryDelayMs: 0 },
  });
  definition.edges.push({ id: "next", source: "trigger", target: "child" });
  const compiled = compileWorkflowDefinition({
    workflowId: "parent",
    version: 1,
    definition,
  });
  const result = await createWorkflowRuntime({
    dependencies: {
      workspaceId: "space",
      userId: "user",
      workflowId: "parent",
      runId: "run",
    },
  }).run(compiled.blueprint, { input: { quantity: 3 } });
  expect(result.status).toBe("completed");
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ payload: { quantity: 3 } }),
  );
  expect(JSON.stringify(result.context)).toContain('"answer":42');
  definition.nodes[1]!.settings.maxRetries = 1;
  expect(() =>
    compileWorkflowDefinition({ workflowId: "parent", version: 1, definition }),
  ).toThrow("retries are disabled");
});
