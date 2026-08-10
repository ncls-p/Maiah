import { beforeEach,describe,expect,it,vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  updateAgent: vi.fn(),
  requireWorkspacePermissionAsync: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/route-handler", () => ({
  requireWorkspacePermissionAsync: routeMocks.requireWorkspacePermissionAsync,
  requireResourcePermissionAsync: routeMocks.requireWorkspacePermissionAsync,
  handleRoute: async (request: Request, handler: (context: unknown) => Promise<Response>, options?: { expectedError?: (error: unknown) => Response | null }) => {
    try {
      return await handler({
        session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
        request,
        requestId: "request-1",
      });
    } catch (error) {
      return options?.expectedError?.(error) ?? Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },
}));

vi.mock("@/modules/admin/auth", () => ({
  canManageTenantGlobals: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/modules/agent/use-cases", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/agent/use-cases")>();
  return { ...actual, updateAgent: routeMocks.updateAgent };
});

import { PATCH } from "@/app/api/workspace/agents/[agentId]/route";
import { AgentVersionConflictError,updateAgent } from "@/modules/agent/use-cases";

const agentId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const baseVersionId = "44444444-4444-4444-8444-444444444444";
const currentVersionId = "55555555-5555-4555-8555-555555555555";

function patchRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/workspace/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent configuration route conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireWorkspacePermissionAsync.mockResolvedValue(null);
  });

  it("returns a machine-readable 409 for a stale base version", async () => {
    vi.mocked(updateAgent).mockRejectedValueOnce(new AgentVersionConflictError(currentVersionId));

    const response = await PATCH(patchRequest({ workspaceId, baseVersionId }) as never, { params: Promise.resolve({ agentId }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Agent configuration changed since it was loaded",
      code: "AGENT_VERSION_CONFLICT",
      currentVersionId,
    });
  });

  it("rejects mutation requests that omit the observed base version", async () => {
    const response = await PATCH(patchRequest({ workspaceId, name: "Stale client" }) as never, { params: Promise.resolve({ agentId }) });

    expect(response.status).toBe(400);
    expect(updateAgent).not.toHaveBeenCalled();
  });

  it("accepts runtime budgets without an application-level upper cap", async () => {
    routeMocks.updateAgent.mockResolvedValueOnce({
      agent: { id: agentId, promptSuggestionsJson: [] },
      version: { id: currentVersionId },
    });
    const response = await PATCH(patchRequest({ workspaceId, baseVersionId, maxToolCalls: 100, maxOutputTokens: 500_000 }) as never, { params: Promise.resolve({ agentId }) });

    expect(response.status).toBe(200);
    expect(updateAgent).toHaveBeenCalledWith(expect.objectContaining({ maxToolCalls: 100, maxOutputTokens: 500_000 }));
  });

  it("returns a useful error when a skill is no longer accessible", async () => {
    vi.mocked(updateAgent).mockRejectedValueOnce(new Error("Skill not found"));

    const response = await PATCH(
      patchRequest({
        workspaceId,
        baseVersionId,
        skillBindings: ["66666666-6666-4666-8666-666666666666"],
      }) as never,
      { params: Promise.resolve({ agentId }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Skill not found",
    });
  });
});
