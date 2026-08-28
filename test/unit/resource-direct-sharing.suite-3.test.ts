import { beforeEach, describe, expect, it, vi } from "vitest";

import { replaceDirectResourceSharing } from "@/modules/iam/resource-direct-sharing";
import * as _auditModule from "@/server/domain/services/audit";
import * as _authorizationModule from "@/server/domain/services/authorization";
import * as _dbModule from "@/server/infrastructure/db";
import * as _resourceRepository from "@/server/infrastructure/db/access-resource-repository";
import * as _resourceSharing from "@/modules/iam/resource-sharing";

type Chain = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  then: Promise<unknown[]>["then"];
};

const selectResults: unknown[][] = [];
const insertedValues: unknown[] = [];

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
}));
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: {
    hasPermission: vi.fn(),
    hasDirectPermission: vi.fn(),
    invalidatePermissionCache: vi.fn(),
  },
}));
vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn() },
}));
vi.mock("@/server/infrastructure/db/access-resource-repository", () => ({
  findAccessResource: vi.fn(),
}));
vi.mock("@/modules/iam/resource-sharing", () => ({
  listResourceShareTargets: vi.fn(),
}));
vi.mock("@/modules/iam/use-cases.iam-operation-error", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/iam/use-cases.iam-operation-error")
  >("@/modules/iam/use-cases.iam-operation-error");
  return {
    ...actual,
    getWorkspaceScope: vi.fn().mockResolvedValue({
      workspace: { id: "workspace-1" },
      organization: { id: "organization-1" },
    }),
  };
});

const dbModule = _dbModule as unknown as {
  db: {
    select: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
};
const authorizationModule = _authorizationModule as unknown as {
  authorization: {
    hasPermission: ReturnType<typeof vi.fn>;
    hasDirectPermission: ReturnType<typeof vi.fn>;
    invalidatePermissionCache: ReturnType<typeof vi.fn>;
  };
};
const auditModule = _auditModule as unknown as {
  audit: { emit: ReturnType<typeof vi.fn> };
};
const resourceRepository = _resourceRepository as unknown as {
  findAccessResource: ReturnType<typeof vi.fn>;
};
const resourceSharing = _resourceSharing as unknown as {
  listResourceShareTargets: ReturnType<typeof vi.fn>;
};

function chain(result: unknown[] = []): Chain {
  const query = {} as Chain;
  const promise = Promise.resolve(result);
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.values = vi.fn((values: unknown) => {
    insertedValues.push(values);
    return query;
  });
  query.onConflictDoNothing = vi.fn(() => query);
  query.returning = vi.fn(() => query);
  query.then = promise.then.bind(promise);
  return query;
}

const viewerRoleRow = { id: "viewer-role", name: "workspace.viewer" };
const editorRoleRow = {
  id: "editor-role",
  name: "workspace.knowledge_editor",
};

beforeEach(() => {
  selectResults.length = 0;
  insertedValues.length = 0;
  vi.clearAllMocks();
  dbModule.db.select.mockImplementation(() =>
    chain(selectResults.shift() ?? []),
  );
  dbModule.db.delete.mockImplementation(() => chain());
  dbModule.db.insert.mockImplementation(() => chain());
  authorizationModule.authorization.hasPermission.mockImplementation(
    (_principal: unknown, permission: string) =>
      Promise.resolve(permission === "workspaces.get"),
  );
  authorizationModule.authorization.hasDirectPermission.mockResolvedValue(true);
  authorizationModule.authorization.invalidatePermissionCache.mockResolvedValue(
    undefined,
  );
  resourceRepository.findAccessResource.mockResolvedValue({
    id: "kb-1",
    name: "Docs",
    workspaceId: "workspace-1",
    organizationId: "organization-1",
  });
  resourceSharing.listResourceShareTargets.mockResolvedValue([
    { type: "knowledge_base", id: "kb-1" },
  ]);
  auditModule.audit.emit.mockResolvedValue(undefined);
});

describe("direct resource sharing", () => {
  it("downgrades an editor to view access", async () => {
    selectResults.push(
      [viewerRoleRow, editorRoleRow],
      [{ userId: "member-1" }],
      [{ userId: "member-1" }],
    );

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        shares: [{ userId: "member-1", access: "view" }],
      }),
    ).resolves.toEqual({ userIds: ["member-1"], resourceCount: 1 });
    expect(dbModule.db.delete).toHaveBeenCalledOnce();
    expect(insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "member-1",
          roleId: "viewer-role",
        }),
      ]),
    );
  });

  it("revokes both viewer and editor bindings when shares are omitted", async () => {
    selectResults.push(
      [viewerRoleRow, editorRoleRow],
      [{ userId: "member-1" }],
    );

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        shares: [],
      }),
    ).resolves.toEqual({ userIds: [], resourceCount: 1 });
    expect(dbModule.db.delete).toHaveBeenCalledOnce();
    expect(dbModule.db.insert).not.toHaveBeenCalled();
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledWith("member-1", "knowledge_base", "kb-1");
  });

  it("lazily creates the knowledge editor role when it is missing", async () => {
    dbModule.db.insert.mockImplementationOnce(() => chain([editorRoleRow]));
    selectResults.push([viewerRoleRow], [{ userId: "member-1" }], []);

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        shares: [{ userId: "member-1", access: "edit" }],
      }),
    ).resolves.toEqual({ userIds: ["member-1"], resourceCount: 1 });
    expect(insertedValues).toContainEqual(
      expect.objectContaining({
        name: "workspace.knowledge_editor",
        isSystem: true,
        createdById: "owner-1",
      }),
    );
    expect(insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "member-1",
          roleId: "editor-role",
        }),
      ]),
    );
  });

  it("coerces edit shares to view access for agents", async () => {
    resourceRepository.findAccessResource.mockResolvedValue({
      id: "agent-1",
      workspaceId: "workspace-1",
    });
    resourceSharing.listResourceShareTargets.mockResolvedValue([
      { type: "agent", id: "agent-1" },
    ]);
    selectResults.push(
      [{ id: "agent-user-role", name: "workspace.agent_user" }, viewerRoleRow],
      [{ userId: "member-1" }],
      [],
    );

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "agent",
        resourceId: "agent-1",
        shares: [{ userId: "member-1", access: "edit" }],
      }),
    ).resolves.toEqual({ userIds: ["member-1"], resourceCount: 1 });
    expect(insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "member-1",
          roleId: "agent-user-role",
          resourceType: "agent",
        }),
      ]),
    );
  });
});
