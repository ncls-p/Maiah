import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeAgent: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
  requireWorkspacePermissionAsync: mocks.requirePermission,
  handleRoute: async (
    request: Request,
    handler: (context: {
      session: { user: { id: string } };
    }) => Promise<Response>,
  ) =>
    handler({
      session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
    }),
}));

vi.mock("@/modules/admin/auth", () => ({
  canManageTenantGlobals: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/modules/agent/runtime-executor", () => {
  class AgentExecutionError extends Error {
    code = "AGENT_RUN_FAILED";
    runId = "run-1";
  }
  class AgentRunStateError extends Error {
    code = "AGENT_RUN_STATE";
    runId = "run-1";
    status = "failed";
  }
  return {
    AgentExecutionError,
    AgentRunStateError,
    executeAgent: mocks.executeAgent,
  };
});

vi.mock("@/modules/agent/run-use-cases", () => ({
  listAgentRuns: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/agent/use-cases", () => ({
  getVisibleAgentById: vi.fn(),
}));

import { POST } from "@/app/api/workspace/agents/[agentId]/runs/route";

const agentId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "33333333-3333-4333-8333-333333333333";

describe("direct agent run API permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks the request token scope before executing the agent", async () => {
    mocks.requirePermission.mockResolvedValueOnce(
      Response.json(
        {
          error: "Forbidden",
          reason: "API token scope missing: agents.chat",
        },
        { status: 403 },
      ),
    );

    const response = await POST(
      new Request(`http://localhost/api/workspace/agents/${agentId}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, prompt: "Run" }),
      }) as never,
      { params: Promise.resolve({ agentId }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      workspaceId,
      "agents.chat",
    );
    expect(mocks.executeAgent).not.toHaveBeenCalled();
  });
});
