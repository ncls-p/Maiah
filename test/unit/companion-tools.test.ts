import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  page: vi.fn(),
  perform: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/modules/companion/settings", () => ({
  requireCompanion: mocks.authorize,
}));
vi.mock("@/modules/companion/bridge", () => ({
  readPage: mocks.page,
  performUiAction: mocks.perform,
}));
vi.mock("@/modules/maiah-mcp/actions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  executeAction: mocks.execute,
}));
import { companionTools } from "@/modules/companion/tools";
const tools = companionTools({
  agentId: "agent",
  contextId: "tab",
  identity: {
    userId: "user",
    workspaceId: "workspace",
    authentication: "session",
    headers: { cookie: "session=private" },
  },
});
const signal = new AbortController().signal;
const run = (name: string, input: unknown) =>
  (
    tools[name].execute as (
      input: unknown,
      options: { toolCallId: string; messages: []; abortSignal: AbortSignal },
    ) => Promise<unknown>
  )(input, { toolCallId: "call", messages: [], abortSignal: signal });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({});
  mocks.execute.mockResolvedValue({
    ok: true,
    status: 200,
    result: { id: "created" },
  });
});
describe("companion tools", () => {
  it("uses the shared MCP server for catalog discovery, contract and execution", async () => {
    expect(
      JSON.stringify(
        await run("maiah_search_actions", { query: "workspaces" }),
      ),
    ).toContain("getWorkspaces");
    expect(
      JSON.stringify(
        await run("maiah_describe_action", { operationId: "getWorkspaces" }),
      ),
    ).toContain("contract");
    expect(
      JSON.stringify(
        await run("maiah_execute_action", { operationId: "getWorkspaces" }),
      ),
    ).toContain("created");
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user",
        headers: { cookie: "session=private" },
      }),
      expect.objectContaining({ operationId: "getWorkspaces" }),
      expect.any(AbortSignal),
    );
    expect(mocks.authorize).toHaveBeenCalledTimes(3);
  });
  it("isolates page tools and forwards cancellation", async () => {
    mocks.page.mockResolvedValue({ path: "/en/agents" });
    mocks.perform.mockResolvedValue({ ok: true });
    expect(await run("maiah_page_context", {})).toEqual({ path: "/en/agents" });
    const action = { action: "refresh", path: "/en/agents" };
    expect(await run("maiah_ui_action", action)).toEqual({ ok: true });
    expect(mocks.perform).toHaveBeenCalledWith(
      "user",
      "workspace",
      "tab",
      action,
      signal,
    );
  });
  it("rechecks current configuration before every operation and never calls revoked tools", async () => {
    mocks.authorize.mockRejectedValue(new Error("Access revoked"));
    for (const name of Object.keys(tools))
      await expect(run(name, {})).rejects.toThrow("Access revoked");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.perform).not.toHaveBeenCalled();
  });
});
