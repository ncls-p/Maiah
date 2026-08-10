import type {
  McpPresetMarketplaceManifest,
  ToolMarketplaceManifest,
} from "@/modules/marketplace/manifest-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── DB mock ────────────────────────────────────────────────────────────

type SelectChain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

type DbMock = {
  select: ReturnType<typeof vi.fn>;
};

type DbModule = {
  db: DbMock;
  _selectChain: SelectChain;
};

vi.mock("@/server/infrastructure/db", () => {
  const selectChain: SelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  return {
    db: {
      select: vi.fn(),
    },
    _selectChain: selectChain,
  };
});

vi.mock("@/modules/marketplace/manifest-builders", () => ({
  buildAgentManifest: vi.fn(),
  buildSkillManifest: vi.fn(),
  buildCustomToolManifest: vi.fn(),
  buildMcpPresetManifest: vi.fn(),
}));

vi.mock("@/modules/marketplace/draft-helpers", () => ({
  findExistingDraft: vi.fn().mockResolvedValue(null),
}));

import * as draftHelpers from "@/modules/marketplace/draft-helpers";
import * as manifestBuilders from "@/modules/marketplace/manifest-builders";
import { getPublishPreview } from "@/modules/marketplace/publish-preview";
import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
const mockBuildTool = vi.mocked(manifestBuilders.buildCustomToolManifest);
const mockBuildMcp = vi.mocked(manifestBuilders.buildMcpPresetManifest);
const mockFindDraft = vi.mocked(draftHelpers.findExistingDraft) as ReturnType<
  typeof vi.fn<() => Promise<unknown>>
>;

function resetChains() {
  dbModule._selectChain.from.mockReset().mockReturnThis();
  dbModule._selectChain.where.mockReset().mockReturnThis();
  dbModule._selectChain.limit.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetChains();
  dbModule.db.select.mockReturnValue(dbModule._selectChain);
  mockFindDraft.mockResolvedValue(null);
});

const toolManifest: ToolMarketplaceManifest = {
  type: "custom_tool",
  name: "My Tool",
  tool: {
    status: "active",
    inputSchema: { type: "object" },
    outputSchema: { type: "string" },
    n8nWorkflowId: "wf-1",
    requiresCredentials: true,
    credentialSchema: [{ key: "API_KEY", label: "API Key", required: true }],
  },
};

const mcpManifest: McpPresetMarketplaceManifest = {
  type: "mcp_preset",
  name: "GitHub MCP",
  preset: {
    scope: "server",
    serverName: "github",
    transport: "stdio",
    enabled: true,
    requireApproval: true,
    requiresCredentials: true,
    credentialSchema: [
      { key: "GH_TOKEN", label: "GitHub Token", required: true },
    ],
    tools: [{ name: "list_repos", requireApproval: false, enabled: true }],
  },
};

describe("getPublishPreview", () => {
  describe("when customToolId is provided", () => {
    it("throws when custom tool not found", async () => {
      dbModule._selectChain.limit.mockResolvedValueOnce([]);

      await expect(
        getPublishPreview({
          workspaceId: "ws-1",
          userId: "user-1",
          customToolId: "tool-1",
        }),
      ).rejects.toThrow("Custom tool not found");
    });

    it("returns preview for a custom tool", async () => {
      const toolId = crypto.randomUUID();
      dbModule._selectChain.limit.mockResolvedValueOnce([
        {
          id: toolId,
          name: "My Tool",
          description: "does stuff",
          createdById: "user-1",
        },
      ]);
      mockBuildTool.mockResolvedValueOnce(toolManifest);

      const preview = await getPublishPreview({
        workspaceId: "ws-1",
        userId: "user-1",
        customToolId: toolId,
      });

      expect(preview.resourceType).toBe("custom_tool");
      expect(preview.credentialFields).toHaveLength(1);
      expect(preview.credentialFields[0].key).toBe("API_KEY");
      expect(preview.manifestPreview).toMatchObject({
        type: "custom_tool",
        requiresCredentials: true,
        n8nWorkflow: true,
      });
    });
  });

  describe("when mcpServerId is provided", () => {
    it("throws when MCP server not found", async () => {
      dbModule._selectChain.limit.mockResolvedValueOnce([]);

      await expect(
        getPublishPreview({
          workspaceId: "ws-1",
          userId: "user-1",
          mcpServerId: "srv-1",
        }),
      ).rejects.toThrow("MCP server not found");
    });

    it("returns preview for an MCP server preset", async () => {
      const serverId = crypto.randomUUID();
      // First query: mcpServers — uses .limit()
      dbModule._selectChain.limit.mockResolvedValueOnce([
        {
          id: serverId,
          name: "github",
          workspaceId: "ws-1",
          createdById: "user-1",
        },
      ]);
      // Second query: mcpTools — uses .where() as terminal (no .limit())
      dbModule._selectChain.where
        .mockReturnValueOnce(dbModule._selectChain) // server where → keeps chain for limit
        .mockResolvedValueOnce([
          { id: "tool-1", name: "list_repos", mcpServerId: serverId },
        ]);
      mockBuildMcp.mockReturnValueOnce(mcpManifest);

      const preview = await getPublishPreview({
        workspaceId: "ws-1",
        userId: "user-1",
        mcpServerId: serverId,
      });

      expect(preview.resourceType).toBe("mcp_server");
      expect(preview.credentialFields).toHaveLength(1);
      expect(preview.credentialFields[0].key).toBe("GH_TOKEN");
      expect(preview.manifestPreview).toMatchObject({
        type: "mcp_preset",
        toolCount: 1,
      });
    });
  });

  describe("when mcpToolId is provided", () => {
    it("throws when MCP tool not found", async () => {
      dbModule._selectChain.limit.mockResolvedValueOnce([]);

      await expect(
        getPublishPreview({
          workspaceId: "ws-1",
          userId: "user-1",
          mcpToolId: "tool-1",
        }),
      ).rejects.toThrow("MCP tool not found");
    });

    it("throws when MCP server not found for tool", async () => {
      dbModule._selectChain.limit
        .mockResolvedValueOnce([
          { id: "tool-1", name: "list_repos", mcpServerId: "srv-1" },
        ])
        .mockResolvedValueOnce([]);

      await expect(
        getPublishPreview({
          workspaceId: "ws-1",
          userId: "user-1",
          mcpToolId: "tool-1",
        }),
      ).rejects.toThrow("MCP server not found");
    });

    it("returns preview for an MCP tool", async () => {
      const toolId = crypto.randomUUID();
      const serverId = crypto.randomUUID();
      dbModule._selectChain.limit
        .mockResolvedValueOnce([
          {
            id: toolId,
            name: "list_repos",
            mcpServerId: serverId,
            description: "list them",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: serverId,
            name: "github",
            workspaceId: "ws-1",
            createdById: "user-1",
          },
        ]);
      mockBuildMcp.mockReturnValueOnce(mcpManifest);

      const preview = await getPublishPreview({
        workspaceId: "ws-1",
        userId: "user-1",
        mcpToolId: toolId,
      });

      expect(preview.resourceType).toBe("mcp_tool");
    });
  });
});
