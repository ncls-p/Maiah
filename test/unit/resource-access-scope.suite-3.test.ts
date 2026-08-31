import { beforeEach, describe, expect, it, vi } from "vitest";
import { canEditAgentForScope } from "@/modules/agent/use-cases.get-visible-agent-by-id";
import {
  buildResourceProvenance,
  withResourceProvenance,
} from "@/modules/iam/resource-provenance";

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
  resetScopeMocks,
  selectResults,
} from "./resource-access-scope.fixture";

beforeEach(() => {
  resetScopeMocks();
});

describe("scope-aware assistant administration", () => {
  const agent = {
    id: "agent-1",
    workspaceId: "workspace-1",
    createdById: "owner-1",
    visibility: "private",
    isGlobal: false,
  };

  it("always lets the creator edit", async () => {
    await expect(canEditAgentForScope(agent as never, "owner-1")).resolves.toBe(
      true,
    );
    expect(
      authorizationModule.authorization.hasPermission,
    ).not.toHaveBeenCalled();
  });

  it("lets project admins edit project-scoped assistants", async () => {
    authorizationModule.authorization.hasPermission.mockResolvedValue(true);
    await expect(
      canEditAgentForScope(
        { ...agent, visibility: "workspace", isGlobal: true } as never,
        "project-admin",
      ),
    ).resolves.toBe(true);
    expect(
      authorizationModule.authorization.hasPermission,
    ).toHaveBeenCalledWith(
      { principalType: "user", principalId: "project-admin" },
      "roles.manage",
      "workspace",
      "workspace-1",
    );
  });

  it("requires organization administration for organization scope", async () => {
    selectResults.push([{ organizationId: "organization-1" }]);
    authorizationModule.authorization.hasPermission.mockResolvedValue(true);
    await expect(
      canEditAgentForScope(
        { ...agent, visibility: "organization", isGlobal: true } as never,
        "organization-admin",
      ),
    ).resolves.toBe(true);
    expect(
      authorizationModule.authorization.hasPermission,
    ).toHaveBeenCalledWith(
      { principalType: "user", principalId: "organization-admin" },
      "roles.manage",
      "organization",
      "organization-1",
    );
  });

  it("does not let an unrelated admin edit a private assistant", async () => {
    await expect(
      canEditAgentForScope(agent as never, "other-user", true),
    ).resolves.toBe(false);
  });
});

describe("resource provenance", () => {
  const context = {
    currentUserId: "owner-1",
    workspaceName: "Maiah",
    organizationName: "Deodis",
    ownerNames: new Map([["owner-1", "Nicolas Pierrot"]]),
  };

  it("labels every explicit scope and preserves legacy global provenance", () => {
    expect(
      buildResourceProvenance(
        { createdById: "owner-1", visibility: "workspace" },
        context,
      ),
    ).toEqual({
      scope: "workspace",
      scopeName: "Maiah",
      ownerName: "Nicolas Pierrot",
    });
    expect(
      buildResourceProvenance(
        { createdById: "owner-1", visibility: "organization" },
        context,
      ).scope,
    ).toBe("organization");
    expect(
      buildResourceProvenance(
        { createdById: "owner-1", isGlobal: true },
        context,
      ).scope,
    ).toBe("organization");
    expect(
      buildResourceProvenance({ createdById: "owner-1" }, context),
    ).toEqual({
      scope: "user",
      scopeName: "Nicolas Pierrot",
      ownerName: "Nicolas Pierrot",
    });
    expect(
      buildResourceProvenance({ createdById: "other-user" }, context),
    ).toEqual({
      scope: "workspace",
      scopeName: "Maiah",
      ownerName: "Unknown user",
    });
  });

  it("adds provenance with database context and handles empty input", async () => {
    await expect(
      withResourceProvenance([], "workspace-1", "owner-1"),
    ).resolves.toEqual([]);

    selectResults.push(
      [{ name: "Maiah", organizationName: "Deodis" }],
      [{ id: "owner-1", name: "Nicolas Pierrot" }],
    );
    await expect(
      withResourceProvenance(
        [{ id: "mcp-1", createdById: "owner-1", visibility: "private" }],
        "workspace-1",
        "owner-1",
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "mcp-1",
        provenance: {
          scope: "user",
          scopeName: "Nicolas Pierrot",
          ownerName: "Nicolas Pierrot",
        },
      }),
    ]);
  });

  it("uses fallback scope names when workspace context is absent", async () => {
    selectResults.push([], []);
    const [resource] = await withResourceProvenance(
      [{ createdById: "missing-user", visibility: "organization" }],
      "missing-workspace",
      "owner-1",
    );
    expect(resource.provenance).toEqual({
      scope: "organization",
      scopeName: "Organization",
      ownerName: "Unknown user",
    });
  });
});
