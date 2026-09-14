import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  detail: vi.fn(),
  enqueue: vi.fn(),
  limit: vi.fn(),
  returning: vi.fn(),
  set: vi.fn(),
  insert: vi.fn(),
  agent: vi.fn(),
}));
vi.mock("@/modules/auth/workspace-access", () => ({
  hasResourcePermissionForRequest: mocks.permission,
}));
vi.mock("@/modules/workflows/use-cases", () => ({
  getWorkflowDetail: mocks.detail,
  createWorkflowRun: mocks.enqueue,
}));
vi.mock("@/modules/agent/use-cases", () => ({
  getAgentById: mocks.agent,
  canUseAgent: () => true,
}));
vi.mock("@/modules/agent/runtime-executor", () => ({ executeAgent: vi.fn() }));
vi.mock("@/modules/tool/builtin-tools", () => ({
  getBuiltInToolByName: vi.fn(),
}));
vi.mock("@/server/infrastructure/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: mocks.limit,
    returning: mocks.returning,
    values: mocks.insert,
    set: mocks.set,
  };
  mocks.set.mockImplementation(() => chain);
  mocks.insert.mockImplementation(() => chain);
  return {
    db: { select: () => chain, update: () => chain, insert: () => chain },
  };
});
import { normalizeTaskInput } from "@/modules/scheduled-tasks/use-cases.scheduled-task-frequency";
import {
  assertScheduledTarget,
  createScheduledTask,
} from "@/modules/scheduled-tasks/use-cases.assert-agent-in-workspace";
import { processDueScheduledTasks } from "@/modules/scheduled-tasks/use-cases.process-due-scheduled-tasks";
const task = {
  id: "schedule",
  workspaceId: "workspace",
  userId: "owner",
  agentId: null,
  workflowId: "workflow",
  workflowInputJson: { quantity: 2 },
  title: "Request",
  prompt: "",
  frequency: "interval" as const,
  intervalMinutes: 30,
  timezone: "UTC",
  enabled: true,
  nextRunAt: new Date("2026-09-14T12:00:00Z"),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue(true);
  mocks.detail.mockResolvedValue({
    id: "workflow",
    activeVersion: 2,
    status: "active",
  });
  mocks.returning.mockResolvedValue([{ id: "schedule" }]);
  mocks.enqueue.mockResolvedValue({ id: "run", status: "queued" });
  mocks.limit.mockResolvedValue([task]);
});
describe("scheduled workflows", () => {
  it("requires exactly one target and permits workflows without an assistant prompt", () => {
    expect(normalizeTaskInput(task).prompt).toBe("");
    expect(() => normalizeTaskInput({ ...task, agentId: "agent" })).toThrow(
      "exactly one",
    );
    expect(() => normalizeTaskInput({ ...task, workflowId: null })).toThrow(
      "exactly one",
    );
  });
  it("requires a published accessible workflow before scheduling", async () => {
    await createScheduledTask({ ...task, workflowInput: { quantity: 2 } });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: null,
        workflowId: "workflow",
        workflowInputJson: { quantity: 2 },
      }),
    );
    mocks.permission.mockResolvedValueOnce(false);
    await expect(assertScheduledTarget(task)).rejects.toThrow("permission");
    mocks.detail.mockResolvedValueOnce({ activeVersion: null });
    await expect(assertScheduledTarget(task)).rejects.toThrow("Publish");
  });
  it("queues the published workflow as its owner with a stable schedule occurrence key", async () => {
    await processDueScheduledTasks(new Date("2026-09-14T12:01:00Z"));
    expect(mocks.enqueue).toHaveBeenCalledWith({
      workflowId: "workflow",
      workspaceId: "workspace",
      userId: "owner",
      payload: { quantity: 2 },
      trigger: "scheduled",
      useLatestDraft: false,
      idempotencyKey: "schedule:schedule:2026-09-14T12:00:00.000Z",
    });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ lastWorkflowRunId: "run" }),
    );
    expect(mocks.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastStatus: "success" }),
    );
  });
  it("does not dispatch an occurrence claimed by another scheduler", async () => {
    mocks.returning.mockResolvedValueOnce([]);
    await processDueScheduledTasks();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("records permission revocation as failure without queuing", async () => {
    mocks.permission.mockResolvedValue(false);
    await processDueScheduledTasks();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ lastStatus: "failed" }),
    );
  });
});
