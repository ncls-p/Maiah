import { describe,expect,it } from "vitest";

import {
buildAgentManifest
} from "@/modules/marketplace/manifest-builders";
import { customToolRow,dbModule,resetDb } from "./marketplace-manifest-builders-db.test.db-module";


describe("buildAgentManifest", () => {
  it("throws for missing agents and agents without versions", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]);
    await expect(
      buildAgentManifest("agent-1", "ws-1", "Agent"),
    ).rejects.toThrow("Agent not found");

    resetDb();
    dbModule._c.limit
      .mockResolvedValueOnce([
        {
          id: "agent-1",
          workspaceId: "ws-1",
          description: null,
          activeVersionId: null,
        },
      ])
      .mockResolvedValueOnce([]);
    await expect(
      buildAgentManifest("agent-1", "ws-1", "Agent"),
    ).rejects.toThrow("Agent has no version");
  });

  it("rejects orchestrators instead of publishing an incomplete graph", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([
        {
          id: "agent-1",
          workspaceId: "ws-1",
          kind: "orchestrator",
          activeVersionId: "version-1",
        },
      ])
      .mockResolvedValueOnce([{ id: "version-1", agentId: "agent-1" }]);

    await expect(
      buildAgentManifest("agent-1", "ws-1", "Coordinator"),
    ).rejects.toThrow(
      "Orchestrators cannot be published to the marketplace yet",
    );
  });

  it("bundles portable tool, skill, knowledge, MCP, and custom tool references", async () => {
    const agent = {
      id: "agent-1",
      workspaceId: "ws-1",
      description: "Agent desc",
      activeVersionId: "version-1",
    };
    const version = {
      id: "version-1",
      agentId: "agent-1",
      systemPrompt: "Be helpful",
      providerId: "provider-1",
      modelId: "model-1",
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 1000,
      maxToolCalls: 4,
      toolChoice: "auto",
      generationSettingsJson: { seed: 1 },
      responseFormatJson: { type: "text" },
      memoryPolicyJson: { enabled: true },
      guardrailsJson: { blocked: [] },
      approvalPolicyJson: { mode: "auto" },
    };
    const mcpBinding = {
      toolSource: "mcp",
      toolId: "mcp-tool-1",
      requireApproval: true,
      riskLevel: "medium",
    };
    const customBinding = {
      toolSource: "custom",
      toolId: "custom-1",
      requireApproval: false,
      riskLevel: "low",
    };
    const builtinBinding = {
      toolSource: "builtin",
      toolId: "web_search",
      requireApproval: false,
      riskLevel: "low",
    };
    const skill = {
      id: "skill-1",
      name: "Research",
      description: "Skill",
      markdownFilesJson: [{ path: "SKILL.md", content: "# Research" }],
      sourcePackage: "pkg",
      sourceSkillName: "research",
      installCommand: "npm i pkg",
      metadataJson: { author: "team" },
    };
    dbModule._c.limit
      .mockResolvedValueOnce([agent])
      .mockResolvedValueOnce([version])
      .mockResolvedValueOnce([{ name: "Provider Name" }])
      .mockResolvedValueOnce([
        { displayName: "Model Name", modelId: "model-api" },
      ])
      .mockResolvedValueOnce([{ name: "search", serverId: "server-1" }])
      .mockResolvedValueOnce([{ name: "Remote Server" }])
      .mockResolvedValueOnce([{ name: "Discord notifier" }])
      .mockResolvedValueOnce([
        { id: "mcp-tool-1", name: "search", mcpServerId: "server-1" },
      ])
      .mockResolvedValueOnce([
        {
          id: "server-1",
          name: "Remote Server",
          transport: "sse",
          command: null,
          argsJson: null,
          url: "https://mcp.test/sse",
          enabled: true,
          requireApproval: false,
          healthStatus: "healthy",
          encryptedHeadersJson: { Authorization: "enc" },
          encryptedEnvJson: null,
        },
      ])
      .mockResolvedValueOnce([customToolRow]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([mcpBinding, customBinding, builtinBinding])
      .mockResolvedValueOnce([{ skillId: "skill-1" }])
      .mockResolvedValueOnce([{ knowledgeBaseId: "kb-1" }])
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([skill])
      .mockResolvedValueOnce([{ name: "Docs", description: "Knowledge docs" }])
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([
        {
          name: "search",
          description: "Search",
          inputSchemaJson: { type: "object" },
          outputSchemaJson: null,
          requireApproval: true,
          enabled: true,
        },
      ])
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([]);

    const manifest = await buildAgentManifest(
      "agent-1",
      "ws-1",
      "Portable agent",
      null,
    );

    expect(manifest.type).toBe("agent");
    expect(manifest.description).toBe("Agent desc");
    expect(manifest.agent.providerName).toBe("Provider Name");
    expect(manifest.agent.modelName).toBe("Model Name");
    expect(manifest.toolBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "mcp", ref: "Remote Server/search" }),
        expect.objectContaining({ source: "custom", ref: "Discord notifier" }),
        expect.objectContaining({ source: "builtin", ref: "web_search" }),
      ]),
    );
    expect(manifest.skillBindings ?? []).toHaveLength(1);
    expect(manifest.skillBindings?.[0]).toMatchObject({ ref: "Research" });
    expect(manifest.knowledgeBindings?.[0]).toEqual({
      name: "Docs",
      description: "Knowledge docs",
    });
    expect(manifest.bundledResources?.mcpPresets[0].preset.serverName).toBe(
      "Remote Server",
    );
    expect(manifest.bundledResources?.customTools[0].name).toBe(
      "Discord notifier",
    );
  });
});
