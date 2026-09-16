import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  organizations,
  users,
  workspaceMembers,
} from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import { isPlatformAdminUser } from "@/server/infrastructure/db/platform-admin";
import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";
import {
  createOrganizationOnly,
  listManagedOrganizations,
} from "@/modules/organization/organization-management";
import { createSharingFixture } from "./resource-sharing-db.fixture";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("application admins across organizations", () => {
  let f: Awaited<ReturnType<typeof createSharingFixture>>;
  let emptyOrganization: string;
  beforeAll(async () => {
    f = await createSharingFixture();
    await db.update(users).set({ role: "admin" }).where(eq(users.id, f.owner));
    emptyOrganization = (
      await createOrganizationOnly(f.owner, "Admin-only empty org")
    ).id;
  });
  afterAll(async () => {
    if (!f) return;
    if (emptyOrganization)
      await db
        .delete(organizations)
        .where(eq(organizations.id, emptyOrganization));
    await authorization.invalidatePrincipalPermissionCache(f.outsider);
    await f.cleanup();
  });
  it("honors promotion immediately despite a cached denial, without creating memberships", async () => {
    const ctx = { principalType: "user" as const, principalId: f.outsider };
    expect(
      await authorization.hasPermission(
        ctx,
        "organization.update",
        "organization",
        f.organizationId,
      ),
    ).toBe(false);
    expect(await getWorkspacesByUserId(f.outsider)).toEqual([]);
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, f.outsider));
    expect(await isPlatformAdminUser(f.outsider)).toBe(true);
    const directory = await listManagedOrganizations(f.outsider, true);
    expect(directory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: emptyOrganization,
          canManageSettings: true,
          projects: [],
        }),
      ]),
    );
    expect(
      (await getWorkspacesByUserId(f.outsider)).map((row) => row.workspace.id),
    ).toEqual(expect.arrayContaining([f.workspaceId, f.destinationId]));
    expect(
      await authorization.requireWorkspaceMember(f.outsider, f.workspaceId),
    ).toBe(true);
    expect(
      await authorization.hasPermission(
        ctx,
        "organization.update",
        "organization",
        f.organizationId,
      ),
    ).toBe(true);
    expect(
      await authorization.hasPermission(
        ctx,
        "roles.get",
        "workspace",
        f.workspaceId,
      ),
    ).toBe(true);
    const { agent } = await f.makeAgent("Admin access");
    expect(
      await authorization.hasPermission(
        ctx,
        "agents.update",
        "agent",
        agent.id,
      ),
    ).toBe(true);
    expect(
      await authorization.hasPermission(
        ctx,
        "workspaces.get",
        "workspace",
        crypto.randomUUID(),
      ),
    ).toBe(false);
    expect(
      await authorization.hasPermission(
        ctx,
        "organization.get",
        "organization",
        crypto.randomUUID(),
      ),
    ).toBe(false);
    expect(
      await db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, f.outsider)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, f.outsider)),
    ).toHaveLength(0);
  });
  it("removes implicit access immediately on revocation and ban", async () => {
    const ctx = { principalType: "user" as const, principalId: f.outsider };
    await db
      .update(users)
      .set({ role: "user" })
      .where(eq(users.id, f.outsider));
    expect(
      await authorization.requireWorkspaceMember(f.outsider, f.workspaceId),
    ).toBe(false);
    expect(
      await authorization.hasPermission(
        ctx,
        "organization.update",
        "organization",
        f.organizationId,
      ),
    ).toBe(false);
    expect(await getWorkspacesByUserId(f.outsider)).toEqual([]);
    await db
      .update(users)
      .set({ role: "admin", banned: true })
      .where(eq(users.id, f.outsider));
    expect(await isPlatformAdminUser(f.outsider)).toBe(false);
    expect(
      await authorization.hasPermission(
        ctx,
        "organization.update",
        "organization",
        f.organizationId,
      ),
    ).toBe(false);
  });
  it("keeps ordinary organization members scoped and excludes non-user principals", async () => {
    expect(
      (await listManagedOrganizations(f.member, false)).some(
        (row) => row.id === emptyOrganization,
      ),
    ).toBe(false);
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: f.member },
        "organization.update",
        "organization",
        emptyOrganization,
      ),
    ).toBe(false);
    expect(
      await authorization.hasPermission(
        { principalType: "api_key", principalId: f.owner },
        "organization.update",
        "organization",
        emptyOrganization,
      ),
    ).toBe(false);
    expect(
      await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, f.member),
            eq(organizationMembers.organizationId, f.organizationId),
          ),
        ),
    ).toHaveLength(1);
  });
});
