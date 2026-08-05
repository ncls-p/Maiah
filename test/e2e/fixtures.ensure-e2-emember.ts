// Shared fixtures and helpers for all e2e tests
import type { Cookie, Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { cache } from "@/server/infrastructure/cache";
import { databaseUrl, e2eAccessManager, e2eMember, e2eOrganizationAdmin, e2eOrganizationProjectEditor } from "./fixtures.e2e-user";


export async function ensureE2EMember() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const upserted = await client.query<{ id: string }>(
      `insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
       values ($1, $2, $3, true, 'user', false, now(), now())
       on conflict (email) do update
       set name = excluded.name, role = 'user', banned = false, updated_at = now()
       returning id`,
      [randomUUID(), e2eMember.name, e2eMember.email],
    );
    const userId = upserted.rows[0].id;
    const workspace = await client.query<{
      id: string;
      organization_id: string;
    }>(
      `select w.id, w.organization_id
       from workspaces w
       join organizations o on o.id = w.organization_id
       where w.slug = 'main' and o.slug = 'deodis' and w.archived_at is null
       limit 1`,
    );
    const memberRole = await client.query<{ id: string }>(
      `select id from roles
       where scope_type = 'workspace' and name = 'workspace.member' and is_system = true
       limit 1`,
    );
    const workspaceId = workspace.rows[0]?.id;
    const organizationId = workspace.rows[0]?.organization_id;
    const roleId = memberRole.rows[0]?.id;
    if (!workspaceId || !organizationId || !roleId) {
      throw new Error("E2E workspace member role is not initialized");
    }

    const password = await hashPassword(e2eMember.password);
    await client.query(
      "delete from account where account_id = $1 and provider_id = 'credential'",
      [userId],
    );
    await client.query(
      "insert into account (account_id, provider_id, user_id, password, created_at, updated_at) values ($1, 'credential', $2, $3, now(), now())",
      [userId, userId, password],
    );
    await client.query(
      `insert into organization_members
       (organization_id, user_id, status, created_at, updated_at)
       values ($1, $2, 'active', now(), now())
       on conflict (organization_id, user_id) do update
       set status = 'active', updated_at = now()`,
      [organizationId, userId],
    );
    await client.query(
      `delete from workspace_members where workspace_id = $1 and user_id = $2`,
      [workspaceId, userId],
    );
    await client.query(
      `delete from role_bindings
       where principal_type = 'user' and principal_id = $1
         and resource_type = 'workspace' and resource_id = $2`,
      [userId, workspaceId],
    );
    await client.query(
      `insert into role_bindings
       (principal_type, principal_id, role_id, resource_type, resource_id, created_by_user_id)
       values ('user', $1, $2, 'workspace', $3, $1)`,
      [userId, roleId, workspaceId],
    );
    await client.query(
      `insert into app_settings (key, value_json, updated_by_user_id, updated_at)
       values ($1, $2::jsonb, $3, now())
       on conflict (key) do update
       set value_json = excluded.value_json, updated_at = now()`,
      [
        `onboarding.complete:${userId}`,
        JSON.stringify({ completed: true, source: "playwright" }),
        userId,
      ],
    );
    await cache.delByPrefix(`perm:${userId}:`);
  } finally {
    await client.end();
  }
}

export async function ensureE2EPermissionUser(input: {
  user: { name: string; email: string; password: string };
  roleName: string;
  roleDisplayName?: string;
  roleScope: "organization" | "workspace";
  permissions?: string[];
}) {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(
      `insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
       values ($1, $2, $3, true, 'user', false, now(), now())
       on conflict (email) do update
       set name = excluded.name, role = 'user', banned = false, updated_at = now()
       returning id`,
      [randomUUID(), input.user.name, input.user.email],
    );
    const scope = await client.query<{
      workspace_id: string;
      organization_id: string;
    }>(
      `select w.id as workspace_id, w.organization_id
       from workspaces w
       join organizations o on o.id = w.organization_id
       where w.slug = 'main' and o.slug = 'deodis' and w.archived_at is null
       limit 1`,
    );
    const userId = user.rows[0]?.id;
    const workspaceId = scope.rows[0]?.workspace_id;
    const organizationId = scope.rows[0]?.organization_id;
    if (!userId || !workspaceId || !organizationId) {
      throw new Error("E2E permission scope is not initialized");
    }

    const password = await hashPassword(input.user.password);
    await client.query(
      "delete from account where account_id = $1 and provider_id = 'credential'",
      [userId],
    );
    await client.query(
      "insert into account (account_id, provider_id, user_id, password, created_at, updated_at) values ($1, 'credential', $2, $3, now(), now())",
      [userId, userId, password],
    );
    await client.query(
      `insert into organization_members
       (organization_id, user_id, status, created_at, updated_at)
       values ($1, $2, 'active', now(), now())
       on conflict (organization_id, user_id) do update
       set status = 'active', updated_at = now()`,
      [organizationId, userId],
    );
    await client.query(
      `delete from workspace_members where workspace_id = $1 and user_id = $2`,
      [workspaceId, userId],
    );

    let roleId: string | undefined;
    if (input.permissions) {
      const role = await client.query<{ id: string }>(
        `insert into roles
         (id, scope_type, owner_resource_type, owner_resource_id, name,
          display_name, description, permissions_json, is_system,
          created_by_user_id, created_at, updated_at)
         values ($1, $2::role_scope_type, $3::role_owner_resource_type, $4,
                 $5, $6, $7, $8::jsonb, false, $9, now(), now())
         on conflict (owner_resource_type, owner_resource_id, name)
         where is_system = false do update
         set display_name = excluded.display_name,
             permissions_json = excluded.permissions_json,
             updated_at = now()
         returning id`,
        [
          randomUUID(),
          input.roleScope,
          input.roleScope,
          input.roleScope === "organization" ? organizationId : workspaceId,
          input.roleName,
          input.roleDisplayName ?? input.roleName,
          "E2E restricted permission manager",
          JSON.stringify(input.permissions),
          userId,
        ],
      );
      roleId = role.rows[0]?.id;
    } else {
      const role = await client.query<{ id: string }>(
        `select id from roles where name = $1 and is_system = true limit 1`,
        [input.roleName],
      );
      roleId = role.rows[0]?.id;
    }
    if (!roleId) throw new Error("E2E permission role is not initialized");

    const resourceId =
      input.roleScope === "organization" ? organizationId : workspaceId;
    await client.query(
      `delete from role_bindings
       where principal_type = 'user' and principal_id = $1
         and resource_type = $2 and resource_id = $3`,
      [userId, input.roleScope, resourceId],
    );
    await client.query(
      `insert into role_bindings
       (principal_type, principal_id, role_id, resource_type, resource_id, created_by_user_id)
       values ('user', $1, $2, $3, $4, $1)`,
      [userId, roleId, input.roleScope, resourceId],
    );
    await cache.delByPrefix(`perm:${userId}:`);
    await client.query(
      `insert into app_settings (key, value_json, updated_by_user_id, updated_at)
       values ($1, $2::jsonb, $3, now())
       on conflict (key) do update
       set value_json = excluded.value_json, updated_at = now()`,
      [
        `onboarding.complete:${userId}`,
        JSON.stringify({ completed: true, source: "playwright" }),
        userId,
      ],
    );
  } finally {
    await client.end();
  }
}

export async function ensureE2EAccessManager() {
  await ensureE2EPermissionUser({
    user: e2eAccessManager,
    roleName: "custom.e2e-access-manager",
    roleDisplayName: "Restricted Access Manager",
    roleScope: "workspace",
    permissions: ["workspaces.get", "roles.manage"],
  });
}

export async function ensureE2EOrganizationAdmin() {
  await ensureE2EPermissionUser({
    user: e2eOrganizationAdmin,
    roleName: "organization.admin",
    roleScope: "organization",
  });
}

export async function ensureE2EOrganizationProjectEditor() {
  await ensureE2EPermissionUser({
    user: e2eOrganizationProjectEditor,
    roleName: "workspace.member",
    roleScope: "workspace",
  });
}
