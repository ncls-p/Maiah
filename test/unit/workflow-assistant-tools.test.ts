vi.mock("@/modules/workflows/tool-catalog", () => ({
  listWorkflowTools: vi.fn(async () => []),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterDefinition } from "@/modules/workflows/contracts";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  member: vi.fn(),
  scope: vi.fn(),
  listAgents: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  getWorkflowDetail: vi.fn(),
  listWorkflows: vi.fn(),
  publishWorkflow: vi.fn(),
  createWorkflowRun: vi.fn(),
  getWorkflowRun: vi.fn(),
}));
vi.mock("@/modules/auth/workspace-access", () => ({
  hasResourcePermissionForRequest: mocks.permission,
  hasWorkspacePermissionForRequest: mocks.permission,
  isWorkspaceMemberForRequest: mocks.member,
  checkRequestPermissionScope: mocks.scope,
}));
vi.mock("@/modules/agent/use-cases", () => ({ listAgents: mocks.listAgents }));
vi.mock("@/modules/workflows/use-cases", () => mocks);
vi.mock("@/server/infrastructure/db", () => ({ db: {} }));
import { workflowAssistantTools } from "@/modules/workflows/assistant-tools";

const workflowId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const context = { workspaceId: "workspace", userId: "user" };
function call(name: string, input: unknown) {
  return workflowAssistantTools
    .find((t) => t.name === name)!
    .execute(input, context);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue(true);
  mocks.member.mockResolvedValue(true);
  mocks.scope.mockReturnValue({ granted: true });
  mocks.listAgents.mockResolvedValue([
    { id: workflowId, name: "Service desk", activeVersionId: runId },
  ]);
  mocks.listWorkflows.mockResolvedValue([
    { id: workflowId, name: "Onboarding" },
    { id: runId, name: "Private" },
  ]);
  mocks.getWorkflowRun.mockResolvedValue({
    id: runId,
    workflowId,
    status: "queued",
  });
});

describe("assistant workflow tools", () => {
  it("discovers assistant nodes and the full definition contract", async () => {
    expect(await call("workflow_catalog", {})).toMatchObject({
      definitionSchema: { type: "object" },
      assistants: [{ id: workflowId, ready: true }],
    });
    expect(mocks.listAgents).toHaveBeenCalledWith("workspace", "user", false);
  });
  it("filters workflow discovery by resource permissions", async () => {
    mocks.permission.mockImplementation(
      async (_u, _w, _p, _t, id) => id === workflowId,
    );
    expect(await call("workflow_list", {})).toEqual({
      workflows: [{ id: workflowId, name: "Onboarding" }],
    });
  });
  it("creates a validated draft in the initiating workspace", async () => {
    await call("workflow_create", {
      name: "Onboarding",
      definition: createStarterDefinition(),
    });
    expect(mocks.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace",
        userId: "user",
        name: "Onboarding",
        definition: createStarterDefinition(),
      }),
    );
  });
  it("rejects inaccessible assistants before saving", async () => {
    const definition = createStarterDefinition();
    definition.nodes.push({
      id: "assistant",
      type: "agent.run",
      label: "Agent",
      position: { x: 1, y: 1 },
      parameters: { agentId: runId, prompt: "Hello" },
      settings: { timeoutMs: 30000, maxRetries: 0, retryDelayMs: 1000 },
    });
    definition.edges.push({
      id: "next",
      source: "trigger",
      target: "assistant",
    });
    await expect(
      call("workflow_create", { name: "Invalid", definition }),
    ).rejects.toThrow();
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
  });
  it("reads, updates and publishes through the existing permission gates", async () => {
    await call("workflow_get", { workflowId });
    await call("workflow_update", {
      workflowId,
      definition: createStarterDefinition(),
    });
    await call("workflow_publish", { workflowId });
    expect(mocks.getWorkflowDetail).toHaveBeenCalledWith(
      workflowId,
      "workspace",
    );
    expect(mocks.updateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId,
        workspaceId: "workspace",
        userId: "user",
      }),
    );
    expect(mocks.publishWorkflow).toHaveBeenCalledWith(workflowId, "workspace");
  });
  it("queues only the published version and preserves a user-scoped retry key", async () => {
    await call("workflow_run", {
      workflowId,
      input: { ticket: "REQ001" },
      idempotencyKey: "request-1",
    });
    expect(mocks.createWorkflowRun).toHaveBeenCalledWith({
      workflowId,
      payload: { ticket: "REQ001" },
      workspaceId: "workspace",
      userId: "user",
      trigger: "agent",
      useLatestDraft: false,
      idempotencyKey: "assistant:user:request-1",
    });
    await expect(call("workflow_run", { workflowId })).rejects.toThrow();
  });
  it("returns status without reporting a queued run as completed", async () => {
    expect(await call("workflow_run_status", { runId })).toMatchObject({
      status: "queued",
    });
    expect(mocks.getWorkflowRun).toHaveBeenCalledWith(runId, "workspace");
  });
  it("rejects missing context, insufficient permissions and workspace injection", async () => {
    expect(() => workflowAssistantTools[0]!.execute({})).toThrow("context");
    mocks.permission.mockResolvedValue(false);
    await expect(
      call("workflow_run", { workflowId, idempotencyKey: "no" }),
    ).rejects.toThrow("permission");
    expect(mocks.createWorkflowRun).not.toHaveBeenCalled();
    await expect(
      call("workflow_create", {
        name: "Other",
        workspaceId: "other",
        definition: createStarterDefinition(),
      }),
    ).rejects.toThrow();
    mocks.scope.mockReturnValue({ granted: false });
    await expect(call("workflow_catalog", {})).rejects.toThrow("permission");
  });
});
