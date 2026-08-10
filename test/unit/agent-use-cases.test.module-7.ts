import { describe, expect, it, vi } from "vitest";

import { cloneDelegationBindings } from "@/modules/agent/delegation-use-cases";
import { cloneAgent, getAgentDefaultPreferences, reorderOrganizationAgents, setOrganizationDefaultAgent, setUserDefaultAgent } from "@/modules/agent/use-cases";
import { cloneKnowledgeBindings } from "@/modules/knowledge/use-cases";
import { cloneSkillBindings } from "@/modules/skills/use-cases";
import { cloneToolBindings } from "@/modules/tool/use-cases";
import { Chain, dbModule, fakeAgent, fakeVersion, reset } from "./agent-use-cases.test.chain";

// ─── defaults, ordering, cloning ───────────────────────────────────────

describe("agent defaults, ordering, and cloning", () => {
  it("resolves organization/user default preferences with availability filtering", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ id: "org-agent" }]).mockResolvedValueOnce([{ defaultAgentId: "user-agent" }]);

    await expect(getAgentDefaultPreferences("ws-1", "user-1", new Set(["org-agent"]))).resolves.toEqual({
      organizationDefaultAgentId: "org-agent",
      userDefaultAgentId: null,
      effectiveDefaultAgentId: "org-agent",
      hiddenAgentIds: [],
    });
  });

  it("clears and sets user default agents", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      setUserDefaultAgent({
        workspaceId: "ws-1",
        userId: "user-1",
        agentId: null,
      }),
    ).resolves.toEqual({
      organizationDefaultAgentId: null,
      userDefaultAgentId: null,
      effectiveDefaultAgentId: null,
      hiddenAgentIds: [],
    });
    expect(dbModule.db.insert).toHaveBeenCalled();

    reset();
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule.db.insert.mockReturnValue(dbModule._c);
    dbModule._c.limit
      .mockResolvedValueOnce([{ ...fakeAgent, sharingMode: "marketplace" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ defaultAgentId: "agent-1" }]);
    await expect(
      setUserDefaultAgent({
        workspaceId: "ws-1",
        userId: "user-2",
        agentId: "agent-1",
      }),
    ).resolves.toMatchObject({ userDefaultAgentId: "agent-1" });
    expect(dbModule._c.onConflictDoUpdate ?? dbModule._c.values).toBeTruthy();
  });

  it("sets organization defaults only for global or recommended agents", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...fakeAgent, isGlobal: false, isRecommended: false }]);
    await expect(
      setOrganizationDefaultAgent({
        workspaceId: "ws-1",
        userId: "admin",
        agentId: "agent-1",
      }),
    ).rejects.toThrow("Organization assistant not found");

    reset();
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule.db.transaction.mockImplementation((cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx));
    dbModule._c.limit
      .mockResolvedValueOnce([{ ...fakeAgent, isGlobal: true }])
      .mockResolvedValueOnce([{ id: "agent-1" }])
      .mockResolvedValueOnce([]);
    await expect(
      setOrganizationDefaultAgent({
        workspaceId: "ws-1",
        userId: "admin",
        agentId: "agent-1",
      }),
    ).resolves.toMatchObject({ organizationDefaultAgentId: "agent-1" });
    expect(dbModule._tx.update).toHaveBeenCalledTimes(2);
  });

  it("reorders organization agents after validating every id", async () => {
    await reorderOrganizationAgents({
      workspaceId: "ws-1",
      userId: "admin",
      agentIds: [],
    });
    expect(dbModule.db.select).not.toHaveBeenCalled();

    dbModule._c.where.mockResolvedValueOnce([{ id: "a" }]);
    await expect(
      reorderOrganizationAgents({
        workspaceId: "ws-1",
        userId: "admin",
        agentIds: ["a", "b"],
      }),
    ).rejects.toThrow("Organization assistant not found");

    reset();
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule.db.transaction.mockImplementation((cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx));
    dbModule._c.where.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    await reorderOrganizationAgents({
      workspaceId: "ws-1",
      userId: "admin",
      agentIds: ["a", "b", "a"],
    });
    expect(dbModule._tx.set).toHaveBeenCalledWith(expect.objectContaining({ organizationDisplayOrder: 0 }));
    expect(dbModule._tx.set).toHaveBeenCalledWith(expect.objectContaining({ organizationDisplayOrder: 1 }));
  });

  it("clones visible agents, source versions, and binding sets", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([
        {
          ...fakeAgent,
          sharingMode: "marketplace",
          promptSuggestionsJson: ["Ask"],
        },
      ])
      .mockResolvedValueOnce([]);
    dbModule._tx.limit.mockResolvedValueOnce([fakeVersion]);
    dbModule._tx.returning.mockResolvedValueOnce([{ ...fakeAgent, id: "clone-1", name: "Copy" }]).mockResolvedValueOnce([{ ...fakeVersion, id: "clone-version", agentId: "clone-1" }]);

    const result = await cloneAgent({
      workspaceId: "ws-1",
      userId: "user-2",
      agentId: "agent-1",
      name: "Copy",
    });

    expect(result.agent.id).toBe("clone-1");
    expect(result.version.id).toBe("clone-version");
    expect(dbModule._tx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        forkedFromAgentId: "agent-1",
        sharingMode: "personal",
      }),
    );
    expect(vi.mocked(cloneToolBindings)).toHaveBeenCalledWith("v1", "clone-version", "ws-1", { userId: "user-2" }, dbModule._tx);
    expect(vi.mocked(cloneKnowledgeBindings)).toHaveBeenCalledWith("v1", "clone-version", "ws-1", { userId: "user-2" }, dbModule._tx);
    expect(vi.mocked(cloneSkillBindings)).toHaveBeenCalledWith("v1", "clone-version", "ws-1", { userId: "user-2" }, dbModule._tx);
  });

  it("clones an orchestrator policy and delegation graph", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...fakeAgent, kind: "orchestrator", promptSuggestionsJson: [] }]).mockResolvedValueOnce([]);
    dbModule._tx.limit.mockResolvedValueOnce([{ ...fakeVersion, orchestrationPolicyJson: { maxDepth: 1 } }]);
    dbModule._tx.returning.mockResolvedValueOnce([{ ...fakeAgent, id: "clone-1", kind: "orchestrator" }]).mockResolvedValueOnce([{ ...fakeVersion, id: "clone-version", agentId: "clone-1" }]);

    await cloneAgent({
      workspaceId: "ws-1",
      userId: "user-1",
      agentId: "agent-1",
    });

    expect(vi.mocked(cloneDelegationBindings)).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAgentVersionId: "v1",
        toAgentVersionId: "clone-version",
        parentAgentId: "clone-1",
      }),
    );
  });
});
