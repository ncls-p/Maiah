import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireScope: vi.fn(),
  requireMember: vi.fn(),
  discoverWorkspaceModels: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
  requireRequestPermissionScopeAsync: mocks.requireScope,
  requireWorkspaceMemberAsync: mocks.requireMember,
  handleRoute: async (
    request: Request,
    handler: (context: {
      session: { user: { id: string } };
      request: Request;
    }) => Promise<Response>,
  ) =>
    handler({
      session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      request,
    }),
}));

vi.mock("@/modules/provider/use-cases", () => ({
  discoverWorkspaceModels: mocks.discoverWorkspaceModels,
}));

import { GET } from "@/app/api/workspace/rag-models/route";

const workspaceId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireScope.mockResolvedValue(null);
  mocks.requireMember.mockResolvedValue(null);
  mocks.discoverWorkspaceModels.mockResolvedValue([
    {
      provider: {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Compatible provider",
        kind: "openai-compatible",
      },
      models: [
        {
          modelId: "dynamic-embedding-model",
          capabilities: { embeddings: true },
        },
      ],
      error: null,
    },
  ]);
});

describe("GET /api/workspace/rag-models", () => {
  it("returns the live provider catalogs for the selected workspace", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/workspace/rag-models?workspaceId=${workspaceId}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireScope).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      workspaceId,
      "providers.viewMetadata",
    );
    expect(mocks.discoverWorkspaceModels).toHaveBeenCalledWith(workspaceId);
    await expect(response.json()).resolves.toMatchObject({
      providers: [
        {
          models: [{ modelId: "dynamic-embedding-model" }],
        },
      ],
    });
  });

  it("rejects an invalid workspace identifier before discovery", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/workspace/rag-models?workspaceId=invalid",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.discoverWorkspaceModels).not.toHaveBeenCalled();
  });
});
