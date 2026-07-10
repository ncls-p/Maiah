import { beforeEach, describe, expect, it, vi } from "vitest";

type Chain = {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const chain = {} as Chain;
  for (const key of ["select", "from", "where", "orderBy"] as const) {
    chain[key] = vi.fn().mockReturnThis();
  }
  chain.limit = vi.fn().mockResolvedValue([]);
  return chain;
}

type DbModule = {
  db: { select: ReturnType<typeof vi.fn> };
  _c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  return {
    db: { select: vi.fn() },
    _c: chain,
  };
});

import * as _dbModule from "@/server/infrastructure/db";
import {
  buildAgentManifest,
  buildCustomToolManifest,
} from "@/modules/marketplace/manifest-builders";

const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  for (const key of ["select", "from", "where", "orderBy"] as const) {
    dbModule._c[key].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
});

const customToolRow = {
  id: "custom-1",
  workspaceId: "ws-1",
  createdById: "user-1",
  name: "Discord notifier",
  description: "Send alerts",
  status: "workflow_created",
  n8nWorkflowId: "wf-1",
  n8nWorkflowUrl: "https://n8n.test/workflow/wf-1",
  inputSchemaJson: {
    type: "object",
    properties: { message: { type: "string" } },
  },
  outputSchemaJson: { type: "object" },
  metadataJson: { source: "builder" },
};

describe("buildCustomToolManifest", () => {
  it("builds credential schemas from secret requests and omits encrypted refs by default", async () => {
    dbModule._c.where.mockResolvedValueOnce([
      {
        fieldsJson: [
          {
            name: "webhookUrl",
            label: "Webhook URL",
            type: "secret",
            required: true,
          },
          { key: "token", label: "Token", description: "Bot token" },
          { label: "ignored" },
        ],
      },
    ]);

    const manifest = await buildCustomToolManifest(
      customToolRow as never,
      "Discord",
      null,
    );

    expect(manifest.type).toBe("custom_tool");
    expect(manifest.description).toBe("Send alerts");
    expect(manifest.tool.requiresCredentials).toBe(true);
    expect(manifest.tool).not.toHaveProperty("secretsIncluded");
    expect(manifest.tool).not.toHaveProperty("encryptedCredentialRefs");
    expect(manifest.tool.credentialSchema).toEqual([
      {
        key: "webhookUrl",
        label: "Webhook URL",
        type: "secret",
        required: true,
        description: null,
      },
      {
        key: "token",
        label: "Token",
        type: undefined,
        required: false,
        description: "Bot token",
      },
    ]);
  });

  it("never queries or exports encrypted credential references", async () => {
    dbModule._c.where.mockResolvedValueOnce([
      { fieldsJson: [{ key: "apiKey", label: "API key" }] },
    ]);

    const manifest = await buildCustomToolManifest(
      customToolRow as never,
      "Discord",
      "Override",
    );

    expect(manifest.description).toBe("Override");
    expect(manifest.tool).not.toHaveProperty("secretsIncluded");
    expect(manifest.tool).not.toHaveProperty("encryptedCredentialRefs");
    expect(dbModule._c.where).toHaveBeenCalledTimes(1);
  });
});

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
