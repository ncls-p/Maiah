import { afterEach, describe, expect, it, vi } from "vitest";
const org = vi.hoisted(() => vi.fn().mockResolvedValue("org-1"));
vi.mock("@/modules/organization/workspace-organization", () => ({
  organizationIdForWorkspace: org,
}));
import { runAction } from "@/modules/maiah-mcp/run-action";
import { executeAction } from "@/modules/maiah-mcp/actions";
import { searchActions } from "@/modules/maiah-mcp/search";
import { multipartBody } from "@/modules/maiah-mcp/files";
import { isApplicationPage } from "@/modules/companion/navigation";
import type { McpIdentity } from "@/modules/maiah-mcp/catalog";
const identity: McpIdentity = {
  userId: "user",
  workspaceId: "workspace",
  authentication: "session",
  headers: { cookie: "session=private" },
};
afterEach(() => vi.unstubAllGlobals());
describe("MCP business actions", () => {
  it("discovers actions for a request with multiple intents and resources", () => {
    const results = searchActions(
      identity,
      "assistant lister rechercher lire créer assistant privé visibilité sélecteur modèle fournisseur température top_p max_output_tokens outils connexions",
      0,
      10,
    );
    const ids = results.actions.map((action) => action.operationId);
    expect(ids).toContain("getWorkspaceAgents");
    expect(ids).toContain("postWorkspaceAgents");
  });
  it("supplies project context when an assistant read parses its query in a helper", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ agent: { id: "agent" } })),
      );
    vi.stubGlobal("fetch", fetch);
    const discovered = searchActions(identity, "getWorkspaceAgentsAgentId")
      .actions[0];
    expect(discovered.inputSchema.properties).toHaveProperty("workspaceId");
    await runAction(identity, {
      operationId: discovered.operationId,
      input: { agentId: "agent" },
    });
    await executeAction(identity, {
      operationId: discovered.operationId,
      parameters: { agentId: "agent" },
      query: {},
    });
    for (const [url] of fetch.mock.calls)
      expect(url.searchParams.get("workspaceId")).toBe(identity.workspaceId);
    await runAction(identity, {
      operationId: discovered.operationId,
      input: { agentId: "agent", workspaceId: "other" },
    });
    expect(fetch.mock.calls[2][0].searchParams.get("workspaceId")).toBe(
      "other",
    );
  });
  it.each([
    "créer un assistant privé LinkedIn",
    "create assistant",
    "postWorkspaceAgents",
  ])("discovers a ready creation schema for %s", (query) => {
    const first = searchActions(identity, query).actions[0];
    expect(first.operationId).toBe("postWorkspaceAgents");
    expect(first.inputSchema.properties).toHaveProperty("systemPrompt");
    expect(first.inputSchema.properties).toHaveProperty("generationSettings");
    expect(
      (first.inputSchema.properties as Record<string, unknown>).temperature,
    ).toMatchObject({ type: "number" });
    expect(first.inputSchema.required).not.toContain("workspaceId");
  });
  it("creates a fully configured private assistant in one authorized request with automatic project context", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ agent: { id: "new-agent" } }, { status: 201 }),
      );
    vi.stubGlobal("fetch", fetch);
    const input = {
      name: "LinkedIn",
      systemPrompt: "Write sourced posts",
      providerId: "provider",
      modelId: "model",
      sharingMode: "personal",
      temperature: 0,
      topP: 0.9,
      toolBindings: [],
      generationSettings: { topK: 20, seed: 0 },
    };
    const result = await runAction(identity, {
      operationId: "postWorkspaceAgents",
      input,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url.pathname).toBe("/api/workspace/agents");
    expect(JSON.parse(init.body)).toEqual({
      ...input,
      workspaceId: "workspace",
      temperature: "0",
      topP: "0.9",
    });
    expect(init.headers.cookie).toBe("session=private");
    expect(result.navigation?.page).toBe("/agents/new-agent");
  });
  it.each([403, 409, 500])(
    "preserves %i without automatic mutation replay",
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(Response.json({ error: "refusal" }, { status }));
      vi.stubGlobal("fetch", fetch);
      const result = await runAction(identity, {
        operationId: "patchWorkspaceAgentsAgentId",
        input: {
          agentId: "agent",
          baseVersionId: "old-version",
          name: "Changed",
        },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ ok: false, status });
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
        baseVersionId: "old-version",
      });
    },
  );
  it("keeps caller authentication and an explicit workspace override for the route permission check", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Forbidden" }, { status: 403 }),
      );
    vi.stubGlobal("fetch", fetch);
    await runAction(
      {
        ...identity,
        authentication: "apiKey",
        headers: { Authorization: "Bearer scoped" },
      },
      { operationId: "getWorkspaceAgents", input: { workspaceId: "foreign" } },
    );
    expect(fetch.mock.calls[0][0].searchParams.get("workspaceId")).toBe(
      "foreign",
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer scoped");
  });
  it("creates bounded multipart data and rejects malformed/oversized content", async () => {
    const form = multipartBody({
      workspaceId: "workspace",
      files: [
        { name: "notes.txt", base64: Buffer.from("Hello").toString("base64") },
      ],
    });
    expect(await (form.get("file") as File).text()).toBe("Hello");
    expect(form.get("workspaceId")).toBe("workspace");
    expect(() =>
      multipartBody({ files: [{ name: "bad", base64: "not base64" }] }),
    ).toThrow();
    expect(() =>
      multipartBody({
        files: [
          { name: "large", base64: Buffer.alloc(180001).toString("base64") },
        ],
      }),
    ).toThrow();
  });
  it("permits existing localized pages and refuses invented or external routes", () => {
    expect(isApplicationPage("/fr/agents/agent-1")).toBe(true);
    expect(isApplicationPage("/en/tools")).toBe(true);
    for (const path of [
      "/fr/assistants",
      "https://evil.test",
      "/fr/agents/../admin",
      "/api/admin/users",
      "/fr/agents/%2e%2e",
    ])
      expect(isApplicationPage(path)).toBe(false);
  });
});
