import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    then: vi.fn(),
  };
  return {
    chain,
    select: vi.fn(),
    insert: vi.fn(),
    member: vi.fn(),
    permission: vi.fn(),
    organization: vi.fn(),
    agent: vi.fn(),
    builders: vi.fn(),
  };
});
vi.mock("@/server/infrastructure/db", () => ({
  db: { select: mocks.select, insert: mocks.insert },
}));
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: {
    requireWorkspaceMember: mocks.member,
    hasPermission: mocks.permission,
  },
}));
vi.mock("@/modules/organization/workspace-organization", () => ({
  organizationIdForWorkspace: mocks.organization,
}));
vi.mock("@/modules/workflows/builder-settings", () => ({
  getOrganizationWorkflowBuilderAgent: mocks.agent,
  getWorkflowBuilderAdminState: mocks.builders,
}));
import {
  getCompanionState,
  requireCompanion,
  setCompanionAgent,
  companionAdminState,
  writeSetting,
  readSetting,
} from "@/modules/companion/settings";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue(mocks.chain);
  mocks.insert.mockReturnValue(mocks.chain);
  mocks.chain.from.mockReturnThis();
  mocks.chain.where.mockReturnThis();
  mocks.chain.values.mockReturnThis();
  mocks.chain.limit.mockResolvedValue([]);
  mocks.chain.then.mockImplementation((resolve: (rows: unknown[]) => void) =>
    resolve([{ id: "agent" }]),
  );
  mocks.member.mockResolvedValue(true);
  mocks.permission.mockResolvedValue(true);
  mocks.organization.mockResolvedValue("org");
  mocks.agent.mockResolvedValue({
    id: "agent",
    name: "Helper",
    kind: "assistant",
    activeVersionId: "v1",
  });
  mocks.builders.mockResolvedValue({
    availableAgents: [
      { id: "agent", ready: true },
      { id: "orchestrator", ready: true },
    ],
  });
});
function config(enabled = true) {
  mocks.chain.limit
    .mockResolvedValueOnce([{ valueJson: enabled }])
    .mockResolvedValueOnce([{ valueJson: "agent" }]);
}
describe("companion organization configuration", () => {
  it("defaults to disabled and unavailable without configuration", async () => {
    expect(await getCompanionState("u", "w")).toMatchObject({
      enabled: false,
      available: false,
      agentId: null,
    });
  });
  it("makes the configured assistant available only to authorized members", async () => {
    config();
    expect(await requireCompanion("u", "w", "agent")).toMatchObject({
      available: true,
      organizationId: "org",
      agentId: "agent",
    });
    expect(mocks.agent).toHaveBeenCalledWith("agent", "w");
    expect(mocks.permission).toHaveBeenCalledWith(
      { principalType: "user", principalId: "u" },
      "agents.chat",
      "workspace",
      "w",
    );
    mocks.member.mockResolvedValue(false);
    expect(await getCompanionState("outsider", "w")).toBeNull();
  });
  it("refuses removed permissions, disabled configuration and mismatched assistants", async () => {
    config();
    mocks.permission.mockResolvedValue(false);
    await expect(requireCompanion("u", "w")).rejects.toThrow("access revoked");
    mocks.permission.mockResolvedValue(true);
    config(false);
    await expect(requireCompanion("u", "w")).rejects.toThrow("unavailable");
    config();
    await expect(requireCompanion("u", "w", "other")).rejects.toThrow(
      "unavailable",
    );
    config();
    mocks.agent.mockResolvedValue(null);
    await expect(requireCompanion("u", "w")).rejects.toThrow("unavailable");
    mocks.organization.mockResolvedValue(null);
    expect(await getCompanionState("u", "w")).toBeNull();
  });
  it("filters non-assistants and rejects unavailable selections before writing", async () => {
    config();
    expect(await companionAdminState("org")).toEqual({
      enabled: true,
      agentId: "agent",
      availableAgents: [{ id: "agent", ready: true }],
    });
    config();
    await expect(setCompanionAgent("org", "orchestrator", "u")).rejects.toThrow(
      "assistant available to this organization",
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    config();
    await setCompanionAgent("org", "agent", "u");
    expect(mocks.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "companion:organization:org",
        valueJson: "agent",
        updatedById: "u",
      }),
    );
    config();
    await setCompanionAgent("org", null, "u");
    expect(mocks.chain.values).toHaveBeenLastCalledWith(
      expect.objectContaining({ valueJson: null }),
    );
  });
  it.each(["version", "provider", "model", "tools"])(
    "allows selecting an assistant despite %s readiness",
    async (unavailableReason) => {
      mocks.builders.mockResolvedValue({
        availableAgents: [{ id: "agent", ready: false, unavailableReason }],
      });
      await setCompanionAgent("org", "agent", "u");
      expect(mocks.chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "companion:organization:org",
          valueJson: "agent",
          updatedById: "u",
        }),
      );
    },
  );
  it("persists global activation and preserves missing settings", async () => {
    expect(await readSetting("missing")).toBeUndefined();
    await writeSetting("companion:enabled", true, "admin");
    expect(mocks.chain.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ valueJson: true, updatedById: "admin" }),
      }),
    );
  });
});
