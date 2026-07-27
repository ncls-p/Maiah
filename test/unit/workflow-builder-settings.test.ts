import { beforeEach, describe, expect, it, vi } from "vitest";

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const chain = {} as Chain;
  for (const key of [
    "select",
    "insert",
    "from",
    "where",
    "leftJoin",
    "values",
    "onConflictDoUpdate",
  ] as const) {
    chain[key] = vi.fn().mockReturnThis();
  }
  chain.orderBy = vi.fn().mockResolvedValue([]);
  chain.limit = vi.fn().mockResolvedValue([]);
  return chain;
}

type DbModule = {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
  _chain: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  return {
    db: {
      select: vi.fn().mockReturnValue(chain),
      insert: vi.fn().mockReturnValue(chain),
    },
    _chain: chain,
  };
});

import * as _dbModule from "@/server/infrastructure/db";
import {
  getConfiguredWorkflowBuilderAgentId,
  getWorkflowBuilderAdminState,
  getWorkflowBuilderConfig,
  setWorkflowBuilderConfig,
} from "@/modules/workflows/builder-settings";

const dbModule = _dbModule as unknown as DbModule;
const workspaceId = "11111111-1111-4111-8111-111111111111";
const readyAgentId = "22222222-2222-4222-8222-222222222222";
const unavailableAgentId = "33333333-3333-4333-8333-333333333333";

function resetDb() {
  for (const key of [
    "select",
    "insert",
    "from",
    "where",
    "leftJoin",
    "values",
    "onConflictDoUpdate",
  ] as const) {
    dbModule._chain[key].mockReset().mockReturnThis();
  }
  dbModule._chain.orderBy.mockReset().mockResolvedValue([]);
  dbModule._chain.limit.mockReset().mockResolvedValue([]);
  dbModule.db.select.mockReset().mockReturnValue(dbModule._chain);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._chain);
}

function agentRow(
  overrides: Partial<{
    id: string;
    name: string;
    description: string | null;
    activeVersionId: string | null;
    providerId: string | null;
    modelId: string | null;
    providerName: string | null;
    providerEnabled: boolean | null;
    providerArchivedAt: Date | null;
    modelDisplayName: string | null;
    modelTechnicalId: string | null;
    modelEnabled: boolean | null;
    modelCapabilities: unknown;
  }> = {},
) {
  return {
    id: readyAgentId,
    name: "Workflow builder",
    description: null,
    activeVersionId: "version-1",
    providerId: "provider-1",
    modelId: "model-1",
    providerName: "OpenAI",
    providerEnabled: true,
    providerArchivedAt: null,
    modelDisplayName: "GPT",
    modelTechnicalId: "gpt",
    modelEnabled: true,
    modelCapabilities: { tools: true },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
});

describe("workflow builder settings", () => {
  it("loads a valid configured assistant and falls back on invalid data", async () => {
    dbModule._chain.limit.mockResolvedValueOnce([
      { valueJson: { agentId: readyAgentId } },
    ]);
    await expect(getWorkflowBuilderConfig(workspaceId)).resolves.toEqual({
      agentId: readyAgentId,
    });

    dbModule._chain.limit.mockResolvedValueOnce([
      { valueJson: { agentId: "not-a-uuid" } },
    ]);
    await expect(
      getConfiguredWorkflowBuilderAgentId(workspaceId),
    ).resolves.toBeNull();
  });

  it("reports ready and unavailable assistants in the admin state", async () => {
    dbModule._chain.limit.mockResolvedValueOnce([
      { valueJson: { agentId: readyAgentId } },
    ]);
    dbModule._chain.orderBy.mockResolvedValueOnce([
      agentRow(),
      agentRow({
        id: unavailableAgentId,
        name: "No tools",
        modelDisplayName: null,
        modelTechnicalId: "plain-model",
        modelCapabilities: { tools: false },
      }),
      agentRow({
        id: "44444444-4444-4444-8444-444444444444",
        name: "Incomplete",
        activeVersionId: null,
        providerEnabled: false,
        providerArchivedAt: new Date(),
        modelEnabled: false,
        modelCapabilities: null,
      }),
    ]);

    const result = await getWorkflowBuilderAdminState(workspaceId);

    expect(result.config.agentId).toBe(readyAgentId);
    expect(result.availableAgents).toEqual([
      expect.objectContaining({
        id: readyAgentId,
        modelDisplayName: "GPT",
        supportsTools: true,
        ready: true,
      }),
      expect.objectContaining({
        id: unavailableAgentId,
        modelDisplayName: "plain-model",
        supportsTools: false,
        ready: false,
      }),
      expect.objectContaining({
        name: "Incomplete",
        supportsTools: true,
        ready: false,
      }),
    ]);
  });

  it("persists automatic selection and returns the saved config", async () => {
    dbModule._chain.limit.mockResolvedValueOnce([
      { valueJson: { agentId: null } },
    ]);

    await expect(
      setWorkflowBuilderConfig({
        workspaceId,
        agentId: null,
        updatedById: "user-1",
      }),
    ).resolves.toEqual({ agentId: null });

    expect(dbModule.db.insert).toHaveBeenCalledOnce();
    expect(dbModule._chain.onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("persists a ready assistant", async () => {
    dbModule._chain.orderBy.mockResolvedValueOnce([agentRow()]);
    dbModule._chain.limit.mockResolvedValueOnce([
      { valueJson: { agentId: readyAgentId } },
    ]);

    await expect(
      setWorkflowBuilderConfig({
        workspaceId,
        agentId: readyAgentId,
        updatedById: "user-1",
      }),
    ).resolves.toEqual({ agentId: readyAgentId });

    expect(dbModule.db.insert).toHaveBeenCalledOnce();
  });

  it("rejects missing and unready assistants", async () => {
    dbModule._chain.orderBy.mockResolvedValueOnce([]);
    await expect(
      setWorkflowBuilderConfig({
        workspaceId,
        agentId: readyAgentId,
        updatedById: "user-1",
      }),
    ).rejects.toThrow("Workflow builder assistant not found");

    dbModule._chain.orderBy.mockResolvedValueOnce([
      agentRow({
        id: unavailableAgentId,
        modelCapabilities: { tools: false },
      }),
    ]);
    await expect(
      setWorkflowBuilderConfig({
        workspaceId,
        agentId: unavailableAgentId,
        updatedById: "user-1",
      }),
    ).rejects.toThrow(
      "Workflow builder assistant requires an active tool-capable model",
    );
  });
});
