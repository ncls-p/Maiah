import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  sync: vi.fn(),
  permission: vi.fn(),
}));
vi.mock("@/modules/auth/workspace-access", () => ({
  hasResourcePermissionForRequest: mocks.permission,
}));
vi.mock("@/modules/mcp/oauth/flow", () => ({ finishOAuth: mocks.finish }));
vi.mock("@/modules/mcp/use-cases.sync-mcp-tools", () => ({
  syncMcpTools: mocks.sync,
}));
vi.mock("@/lib/env", () => ({
  env: { BETTER_AUTH_URL: "https://maiah.example" },
}));
vi.mock("@/lib/route-handler", () => ({
  handleRoute: (_: unknown, callback: (context: unknown) => unknown) =>
    callback({ session: { user: { id: "user" } } }),
}));
import { GET } from "@/app/api/mcp/oauth/callback/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.finish.mockResolvedValue({
    serverId: "server",
    workspaceId: "workspace",
  });
  mocks.permission.mockResolvedValue(false);
  mocks.sync.mockResolvedValue({ status: "healthy" });
});
it("connects a reader without changing the shared catalog's schedule", async () => {
  const response = await GET(
    new NextRequest(
      "https://maiah.example/api/mcp/oauth/callback?state=once&code=secret",
    ),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://maiah.example/tools?tab=mcp&oauth=connected",
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(mocks.sync).not.toHaveBeenCalled();
});
it("discovers a manager's tools after authorization", async () => {
  mocks.permission.mockResolvedValue(true);
  await GET(
    new NextRequest(
      "https://maiah.example/api/mcp/oauth/callback?state=once&code=secret",
    ),
  );
  expect(mocks.sync).toHaveBeenCalledWith("server", "workspace", "user");
});
it("does not reflect callback secrets or upstream errors in the redirect", async () => {
  mocks.finish.mockRejectedValue(new Error("secret upstream credentials"));
  const response = await GET(
    new NextRequest(
      "https://maiah.example/api/mcp/oauth/callback?state=once&code=secret",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://maiah.example/tools?tab=mcp&oauth=failed",
  );
  expect(mocks.permission).not.toHaveBeenCalled();
});
