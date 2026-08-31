import { beforeEach, describe, expect, it, vi } from "vitest";

const helperMocks = vi.hoisted(() => ({
  upsertMarketplaceDraft: vi.fn(async (input: unknown) => ({ draft: input })),
  buildAgentManifest: vi.fn(async () => ({
    type: "agent",
    name: "Agent",
    agent: {},
  })),
  buildCustomToolManifest: vi.fn(async () => ({
    type: "custom_tool",
    name: "Tool",
    tool: {},
  })),
  buildMcpPresetManifest: vi.fn(() => ({
    type: "mcp_preset",
    name: "Preset",
    preset: { tools: [] },
  })),
  buildSkillManifest: vi.fn(() => ({
    type: "skill",
    name: "Skill",
    skill: { markdownFiles: [] },
  })),
  installAgentManifest: vi.fn(async () => ({ id: "installed-agent" })),
  installCustomTool: vi.fn(async () => ({
    tool: { id: "installed-tool" },
    requiresCredentials: false,
  })),
  installMcpPreset: vi.fn(async () => ({
    server: { id: "installed-server" },
    requiresCredentials: true,
  })),
  installPostInstallFlags: vi.fn(() => ({ requiresCredentials: false })),
}));

vi.mock("@/modules/marketplace/draft-helpers", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/marketplace/draft-helpers")
  >()),
  upsertMarketplaceDraft: helperMocks.upsertMarketplaceDraft,
}));
vi.mock("@/modules/marketplace/manifest-builders", () => ({
  buildAgentManifest: helperMocks.buildAgentManifest,
  buildCustomToolManifest: helperMocks.buildCustomToolManifest,
  buildMcpPresetManifest: helperMocks.buildMcpPresetManifest,
  buildSkillManifest: helperMocks.buildSkillManifest,
}));
vi.mock("@/modules/marketplace/install-helpers", () => ({
  installAgentManifest: helperMocks.installAgentManifest,
  installCustomTool: helperMocks.installCustomTool,
  installMcpPreset: helperMocks.installMcpPreset,
  installPostInstallFlags: helperMocks.installPostInstallFlags,
}));
vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { hasPermission: vi.fn().mockResolvedValue(false) },
}));
vi.mock("@/server/infrastructure/db/access-resource-repository", () => ({
  listDirectlyBoundResourceIds: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/logger", () => ({ logHandledError: vi.fn() }));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};
function makeChain(): Chain {
  const c = {} as Chain;
  for (const key of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "values",
    "set",
  ] as const)
    c[key] = vi.fn().mockReturnThis();
  c.limit = vi.fn().mockResolvedValue([]);
  c.returning = vi.fn().mockResolvedValue([]);
  return c;
}
type DbModule = {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };
  _c: Chain;
  _tx: Chain;
};
vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  const tx = makeChain();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    _c: chain,
    _tx: tx,
  };
});

import {
  createMarketplaceDraft,
  publishAgentDraft,
} from "@/modules/marketplace/use-cases";
import * as _dbModule from "@/server/infrastructure/db";

const dbModule = _dbModule as unknown as DbModule;
const ids = { workspaceId: "ws-1", userId: "user-1", otherUserId: "user-2" };

function resetChain(chain: Chain) {
  for (const key of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "values",
    "set",
  ] as const)
    chain[key].mockReset().mockReturnThis();
  chain.limit.mockReset().mockResolvedValue([]);
  chain.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetChain(dbModule._c);
  resetChain(dbModule._tx);
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.transaction
    .mockReset()
    .mockImplementation((cb: (tx: Chain) => Promise<unknown>) =>
      cb(dbModule._tx),
    );
  helperMocks.installPostInstallFlags.mockReturnValue({
    requiresCredentials: false,
  });
});

describe("marketplace draft creation", () => {
  it("creates and publishes agent drafts for owned agents", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      {
        id: "agent-1",
        name: "Agent",
        description: "Desc",
        createdById: ids.userId,
      },
    ]);
    await publishAgentDraft({
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      agentId: "agent-1",
      version: "1.0.0",
    });
    expect(helperMocks.buildAgentManifest).toHaveBeenCalledWith(
      "agent-1",
      ids.workspaceId,
      "Agent",
      "Desc",
    );
    expect(helperMocks.upsertMarketplaceDraft).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent", status: "published" }),
    );

    resetChain(dbModule._c);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([
      {
        id: "agent-1",
        name: "Agent",
        description: null,
        createdById: ids.userId,
      },
    ]);
    await createMarketplaceDraft({
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      agentId: "agent-1",
      version: "draft",
    });
    expect(helperMocks.upsertMarketplaceDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceResourceType: "agent",
        version: "draft",
      }),
    );
  });
});
