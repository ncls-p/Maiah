import type { AgentMarketplaceManifest } from "@/modules/marketplace/manifest-types";
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

const mockBuildAgent = vi.mocked(manifestBuilders.buildAgentManifest);
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

// ─── Fixture manifests ──────────────────────────────────────────────────

const agentManifest: AgentMarketplaceManifest = {
  type: "agent",
  name: "Test Agent",
  description: "An agent",
  agent: {
    systemPrompt: "You are helpful",
    providerId: "prov-1",
    modelId: "model-1",
    providerName: "OpenAI",
    modelName: "gpt-4",
  },
  toolBindings: [
    { source: "builtin", ref: "web_search", requireApproval: false },
  ],
  skillBindings: [{ ref: "my-skill" }],
  knowledgeBindings: [{ name: "kb-1" }],
  bundledResources: { skills: [], mcpPresets: [], customTools: [] },
};

describe("getPublishPreview", () => {
  describe("existing draft detection", () => {
    it("marks hasExistingDraft true when a draft exists", async () => {
      const agentId = crypto.randomUUID();
      const draftId = crypto.randomUUID();
      dbModule._selectChain.limit.mockResolvedValueOnce([
        {
          id: agentId,
          name: "Draft Agent",
          description: null,
          createdById: "user-1",
        },
      ]);
      mockBuildAgent.mockResolvedValueOnce(agentManifest);
      mockFindDraft.mockResolvedValueOnce({
        id: draftId,
        tagsJson: ["beta"],
      } as Parameters<(typeof mockFindDraft.mock.results)[0]["value"]>[0]);

      const preview = await getPublishPreview({
        workspaceId: "ws-1",
        userId: "user-1",
        agentId,
      });

      expect(preview.hasExistingDraft).toBe(true);
      expect(preview.existingItemId).toBe(draftId);
      expect(preview.tags).toEqual(["beta"]);
    });

    it("marks hasExistingDraft false when no draft exists", async () => {
      const agentId = crypto.randomUUID();
      dbModule._selectChain.limit.mockResolvedValueOnce([
        {
          id: agentId,
          name: "New Agent",
          description: null,
          createdById: "user-1",
        },
      ]);
      mockBuildAgent.mockResolvedValueOnce(agentManifest);
      mockFindDraft.mockResolvedValueOnce(null);

      const preview = await getPublishPreview({
        workspaceId: "ws-1",
        userId: "user-1",
        agentId,
      });

      expect(preview.hasExistingDraft).toBe(false);
      expect(preview.existingItemId).toBeNull();
    });
  });

  describe("throws when no resource id provided", () => {
    it("throws when no resource id is given", async () => {
      await expect(
        getPublishPreview({ workspaceId: "ws-1", userId: "user-1" }),
      ).rejects.toThrow("No resource id provided");
    });
  });
});
