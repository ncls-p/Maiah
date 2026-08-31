import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyResourceAccessSelection,
  getResourceAccessSelection,
} from "@/modules/iam/resource-access-scope";

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

describe("resource access scopes", () => {
  it.each([
    {
      bindings: [{ teamId: "team-1" }],
      expected: { scope: "team", teamId: "team-1" },
      visibility: undefined,
      isGlobal: undefined,
    },
    {
      bindings: [],
      expected: { scope: "organization" },
      visibility: "organization",
      isGlobal: undefined,
    },
    {
      bindings: [],
      expected: { scope: "project" },
      visibility: "workspace",
      isGlobal: undefined,
    },
    {
      bindings: [],
      expected: { scope: "project" },
      visibility: null,
      isGlobal: true,
    },
    {
      bindings: [],
      expected: { scope: "private" },
      visibility: undefined,
      isGlobal: undefined,
    },
  ] as const)(
    "derives the persisted selection for each visibility",
    async ({ bindings, expected, visibility, isGlobal }) => {
      selectResults.push([...bindings]);
      await expect(
        getResourceAccessSelection({
          resourceType: "mcp_server",
          resourceId: "mcp-1",
          visibility,
          isGlobal,
        }),
      ).resolves.toEqual(expected);
    },
  );

  it("rejects changes when the system viewer role is unavailable", async () => {
    selectResults.push([]);
    await expect(
      applyResourceAccessSelection({
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        userId: "owner-1",
        selection: { scope: "private" },
      }),
    ).rejects.toThrow("Resource access role is unavailable");
  });

  it("applies a private knowledge-base selection without team grants", async () => {
    selectResults.push([{ id: "viewer-role" }], []);

    await applyResourceAccessSelection({
      resourceType: "knowledge_base",
      resourceId: "kb-1",
      userId: "owner-1",
      selection: { scope: "private" },
    });

    expect(mutationSets).toContainEqual(
      expect.objectContaining({ isGlobal: false, visibility: "private" }),
    );
    expect(dbModule.db.insert).not.toHaveBeenCalled();
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ["project", "workspace"],
    ["organization", "organization"],
  ] as const)("applies the %s MCP scope", async (scope, visibility) => {
    selectResults.push(
      [{ id: "viewer-role" }],
      [{ teamId: "old-team" }],
      [{ userId: "member-1" }, { userId: "member-1" }],
    );

    await applyResourceAccessSelection({
      resourceType: "mcp_server",
      resourceId: "mcp-1",
      userId: "owner-1",
      selection: { scope },
    });

    expect(mutationSets).toContainEqual(
      expect.objectContaining({ isGlobal: true, visibility }),
    );
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledTimes(1);
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledWith("member-1", "mcp_server", "mcp-1");
  });

  it("replaces team access and invalidates old and new team members", async () => {
    selectResults.push(
      [{ id: "viewer-role" }],
      [{ teamId: "old-team" }],
      [{ userId: "old-member" }, { userId: "new-member" }],
    );

    await applyResourceAccessSelection({
      resourceType: "knowledge_base",
      resourceId: "kb-1",
      userId: "owner-1",
      selection: { scope: "team", teamId: "new-team" },
    });

    expect(mutationSets).toContainEqual(
      expect.objectContaining({ isGlobal: false, visibility: "private" }),
    );
    expect(dbModule.db.insert).toHaveBeenCalledTimes(1);
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledTimes(2);
  });
});
