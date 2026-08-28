import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAgentAccessSelection,
  getAgentAccessOptions,
  getAgentAccessSelection,
  invalidateAgentAccessCache,
  validateAgentAccessSelection,
} from "@/modules/agent/access-scope";

vi.mock("@/modules/iam/resource-sharing", () => ({
  listResourceShareTargets: vi.fn().mockResolvedValue([
    { type: "agent", id: "agent-1" },
    { type: "agent", id: "agent-2" },
    { type: "knowledge_base", id: "kb-1" },
  ]),
}));

vi.mock("@/modules/agent/access-scope.agent-graph", () => ({
  AgentAccessError: class AgentAccessError extends Error {
    constructor(
      message: string,
      public readonly status = 403,
    ) {
      super(message);
    }
  },
  loadAgentGraphIds: vi.fn().mockResolvedValue(["agent-1", "agent-2"]),
  loadOwnedAgentGraph: vi.fn().mockResolvedValue(["agent-1"]),
}));

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: {
    hasPermission: vi.fn(),
    invalidatePermissionCache: vi.fn(),
  },
}));

import {
  authorizationModule,
  dbModule,
  mutationSets,
  resetScopeMocks,
  selectResults,
} from "./resource-access-scope.fixture";

beforeEach(() => {
  resetScopeMocks();
});

describe("assistant access scope primitives", () => {
  it("offers scopes and teams according to share permissions", async () => {
    selectResults.push(
      [
        {
          workspaceId: "workspace-1",
          projectName: "Maiah",
          organizationId: "organization-1",
          organizationName: "Deodis",
        },
      ],
      [{ id: "team-1", name: "Platform" }],
    );
    authorizationModule.authorization.hasPermission
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await expect(
      getAgentAccessOptions("owner-1", "workspace-1"),
    ).resolves.toEqual({
      scopes: ["private", "project", "team", "organization"],
      teams: [{ id: "team-1", name: "Platform" }],
      projectName: "Maiah",
      organizationName: "Deodis",
    });
  });

  it("returns private-only options and rejects a forbidden scope", async () => {
    const workspace = {
      workspaceId: "workspace-1",
      projectName: "Maiah",
      organizationId: "organization-1",
      organizationName: "Deodis",
    };
    selectResults.push([workspace], [workspace]);

    await expect(
      getAgentAccessOptions("member-1", "workspace-1"),
    ).resolves.toEqual(
      expect.objectContaining({ scopes: ["private"], teams: [] }),
    );
    await expect(
      validateAgentAccessSelection({
        userId: "member-1",
        workspaceId: "workspace-1",
        selection: { scope: "project" },
      }),
    ).rejects.toThrow("You do not have permission");
  });

  it("validates required and organization-owned teams", async () => {
    const workspace = {
      workspaceId: "workspace-1",
      projectName: "Maiah",
      organizationId: "organization-1",
      organizationName: "Deodis",
    };
    authorizationModule.authorization.hasPermission.mockResolvedValue(true);
    selectResults.push([workspace], [{ id: "team-1", name: "Platform" }]);
    await expect(
      validateAgentAccessSelection({
        userId: "owner-1",
        workspaceId: "workspace-1",
        selection: { scope: "team" },
      }),
    ).rejects.toThrow("A team is required");

    selectResults.push([workspace], [{ id: "team-1", name: "Platform" }]);
    await expect(
      validateAgentAccessSelection({
        userId: "owner-1",
        workspaceId: "workspace-1",
        selection: { scope: "team", teamId: "other-team" },
      }),
    ).rejects.toThrow("outside this organization");

    selectResults.push([workspace], [{ id: "team-1", name: "Platform" }]);
    await expect(
      validateAgentAccessSelection({
        userId: "owner-1",
        workspaceId: "workspace-1",
        selection: { scope: "team", teamId: "team-1" },
      }),
    ).resolves.toBeUndefined();
  });

  it("fails when the project no longer exists", async () => {
    selectResults.push([]);
    await expect(
      getAgentAccessOptions("owner-1", "missing-workspace"),
    ).rejects.toThrow("Project not found");
  });

  it("applies assistant team access and invalidates graph caches", async () => {
    selectResults.push(
      [{ workspaceId: "workspace-1", organizationId: "organization-1" }],
      [],
      [{ id: "agent-user-role" }],
      [{ teamId: "old-team" }],
      [{ userId: "member-1" }, { userId: "member-1" }],
      [
        { id: "agent-user-role", name: "workspace.agent_user" },
        { id: "viewer-role", name: "workspace.viewer" },
      ],
    );
    await expect(
      applyAgentAccessSelection({
        agentId: "agent-1",
        userId: "owner-1",
        selection: { scope: "team", teamId: "team-1" },
      }),
    ).resolves.toEqual(["member-1"]);
    expect(dbModule.db.insert).toHaveBeenCalledTimes(2);

    await invalidateAgentAccessCache("agent-1", ["member-1"]);
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledWith("member-1", "agent", "agent-1");
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledWith("member-1", "agent", "agent-2");
  });

  it.each([
    ["private", "private", false],
    ["project", "workspace", true],
    ["organization", "organization", true],
  ] as const)(
    "applies assistant %s visibility",
    async (scope, visibility, isGlobal) => {
      selectResults.push(
        [{ workspaceId: "workspace-1", organizationId: "organization-1" }],
        [],
        [{ id: "agent-user-role" }],
        [],
      );
      if (scope !== "private") {
        selectResults.push(
          [
            { id: "agent-user-role", name: "workspace.agent_user" },
            { id: "viewer-role", name: "workspace.viewer" },
          ],
          [{ userId: "member-1" }],
          [],
        );
      }
      await applyAgentAccessSelection({
        agentId: "agent-1",
        userId: "owner-1",
        selection: { scope },
      });
      expect(mutationSets).toContainEqual(
        expect.objectContaining({
          visibility,
          isGlobal,
          sharingMode: "personal",
        }),
      );
    },
  );

  it("rejects assistant changes without the system role", async () => {
    selectResults.push(
      [{ workspaceId: "workspace-1", organizationId: "organization-1" }],
      [],
      [],
    );
    await expect(
      applyAgentAccessSelection({
        agentId: "agent-1",
        userId: "owner-1",
        selection: { scope: "private" },
      }),
    ).rejects.toThrow("Assistant access role is unavailable");
  });

  it.each([
    [
      [{ teamId: "team-1" }],
      "private",
      false,
      { scope: "team", teamId: "team-1" },
    ],
    [[], "organization", false, { scope: "organization" }],
    [[], "workspace", false, { scope: "project" }],
    [[], "private", true, { scope: "project" }],
    [[], "private", false, { scope: "private" }],
  ] as const)(
    "reads persisted assistant access",
    async (bindings, visibility, isGlobal, expected) => {
      selectResults.push([...bindings]);
      await expect(
        getAgentAccessSelection({
          id: "agent-1",
          visibility,
          isGlobal,
        } as never),
      ).resolves.toEqual(expected);
    },
  );
});
