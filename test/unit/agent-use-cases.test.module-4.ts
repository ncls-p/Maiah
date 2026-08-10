import { describe, expect, it, vi } from "vitest";

import { insertDelegationBindingsForVersion } from "@/modules/agent/delegation-use-cases";
import {
  archiveAgent,
  getAgentVersionById,
  updateAgent,
} from "@/modules/agent/use-cases";
import { cloneToolBindings } from "@/modules/tool/use-cases";
import { dbModule, fakeAgent, fakeVersion } from "./agent-use-cases.test.chain";

// ─── archiveAgent ─────────────────────────────────────────────────────

describe("archiveAgent", () => {
  it("throws when agent not found", async () => {
    await expect(archiveAgent("nonexistent", "ws-1", "user-1")).rejects.toThrow(
      "Agent not found",
    );
  });

  it("throws when non-creator tries to archive without admin", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

    await expect(
      archiveAgent("agent-1", "ws-1", "other", false),
    ).rejects.toThrow("Only the creator or an admin can delete this agent");
  });

  it("archives agent when creator", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

    await archiveAgent("agent-1", "ws-1", "user-1", false);

    expect(dbModule.db.update).toHaveBeenCalled();
  });

  it("archives global agent when canAdminCurate", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...fakeAgent, isGlobal: true }]);

    await archiveAgent("agent-1", "ws-1", "other", true);

    expect(dbModule.db.update).toHaveBeenCalled();
  });
});

// ─── updateAgent ──────────────────────────────────────────────────────

describe("updateAgent", () => {
  it("throws when agent not found", async () => {
    await expect(
      updateAgent({
        agentId: "nonexistent",
        workspaceId: "ws-1",
        userId: "user-1",
        baseVersionId: null,
      }),
    ).rejects.toThrow("Agent not found");
  });

  it("throws when non-creator without admin tries to update", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

    await expect(
      updateAgent({
        agentId: "agent-1",
        workspaceId: "ws-1",
        userId: "other",
        baseVersionId: "v1",
      }),
    ).rejects.toThrow("Only the creator or an admin can update this agent");
  });

  it("rejects stale configuration without starting a transaction", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

    await expect(
      updateAgent({
        agentId: "agent-1",
        workspaceId: "ws-1",
        userId: "user-1",
        baseVersionId: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_VERSION_CONFLICT",
      currentVersionId: "v1",
    });
    expect(dbModule.db.transaction).not.toHaveBeenCalled();
  });

  it("rechecks the base version after acquiring the database row lock", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);
    dbModule._tx.where
      .mockReturnValueOnce(dbModule._tx)
      .mockReturnValueOnce(dbModule._tx);
    dbModule._tx.returning.mockResolvedValueOnce([]);
    dbModule._tx.limit.mockResolvedValueOnce([
      { activeVersionId: "00000000-0000-4000-8000-000000000002" },
    ]);

    await expect(
      updateAgent({
        agentId: "agent-1",
        workspaceId: "ws-1",
        userId: "user-1",
        baseVersionId: "v1",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_VERSION_CONFLICT",
      currentVersionId: "00000000-0000-4000-8000-000000000002",
    });
    expect(dbModule._tx.insert).not.toHaveBeenCalled();
  });

  it("updates agent when creator", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

    // Use a version with null provider/model to avoid provider validation in tx
    const versionNoProvider = {
      ...fakeVersion,
      providerId: null,
      modelId: null,
    };
    const newVersion = { ...fakeVersion, versionNumber: 2, id: "v2" };
    const updatedAgent = { ...fakeAgent };

    // Tx where call sequence (no identity changes):
    // Q1 lock the agent row, Q2 load active version, Q3 compute max version,
    // Q4 activate the new version, Q5 reload the updated agent.
    dbModule._tx.where
      .mockReturnValueOnce(dbModule._tx)
      .mockReturnValueOnce(dbModule._tx)
      .mockResolvedValueOnce([{ maxVersion: 1 }])
      .mockReturnValueOnce(dbModule._tx)
      .mockReturnValueOnce(dbModule._tx);

    dbModule._tx.limit
      .mockResolvedValueOnce([versionNoProvider]) // Q2 getActiveVersionConfig
      .mockResolvedValueOnce([updatedAgent]); // Q8 updatedAgent

    dbModule._tx.returning
      .mockResolvedValueOnce([fakeAgent])
      .mockResolvedValueOnce([newVersion]);

    const result = await updateAgent({
      agentId: "agent-1",
      workspaceId: "ws-1",
      userId: "user-1",
      baseVersionId: "v1",
    });

    expect(result.agent).toBeDefined();
    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
    expect(vi.mocked(cloneToolBindings)).toHaveBeenCalledWith(
      "v1",
      "v2",
      "ws-1",
      { userId: "user-1" },
      dbModule._tx,
    );
  });

  it("versions orchestrator policy and replacement bindings atomically", async () => {
    const orchestrator = { ...fakeAgent, kind: "orchestrator" as const };
    dbModule._c.limit.mockResolvedValueOnce([orchestrator]);
    const activeVersion = {
      ...fakeVersion,
      providerId: null,
      modelId: null,
      orchestrationPolicyJson: null,
    };
    const newVersion = { ...fakeVersion, versionNumber: 2, id: "v2" };
    dbModule._tx.where
      .mockReturnValueOnce(dbModule._tx)
      .mockReturnValueOnce(dbModule._tx)
      .mockResolvedValueOnce([{ maxVersion: 1 }])
      .mockReturnValueOnce(dbModule._tx)
      .mockReturnValueOnce(dbModule._tx);
    dbModule._tx.limit
      .mockResolvedValueOnce([activeVersion])
      .mockResolvedValueOnce([orchestrator]);
    dbModule._tx.returning
      .mockResolvedValueOnce([orchestrator])
      .mockResolvedValueOnce([newVersion]);

    await updateAgent({
      agentId: orchestrator.id,
      workspaceId: orchestrator.workspaceId,
      userId: orchestrator.createdById,
      baseVersionId: orchestrator.activeVersionId,
      delegationBindings: [],
    });

    expect(vi.mocked(insertDelegationBindingsForVersion)).toHaveBeenCalledWith(
      expect.objectContaining({
        parentAgentId: orchestrator.id,
        agentVersionId: "v2",
        bindings: [],
      }),
    );
    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
  });
});

// ─── getAgentVersionById ──────────────────────────────────────────────

describe("getAgentVersionById", () => {
  it("returns null when not found", async () => {
    const result = await getAgentVersionById("nonexistent");
    expect(result).toBeNull();
  });

  it("returns version when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeVersion]);
    const result = await getAgentVersionById("v1");
    expect(result).toEqual(fakeVersion);
  });
});
