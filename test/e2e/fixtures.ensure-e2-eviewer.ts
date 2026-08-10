// Shared fixtures and helpers for all e2e tests
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  databaseUrl,
  e2eMember,
  e2eUser,
  e2eViewer,
} from "./fixtures.e2e-user";
import {
  ensureE2EMember,
  ensureE2EPermissionUser,
} from "./fixtures.ensure-e2-emember";

export async function ensureE2EViewer() {
  await ensureE2EPermissionUser({
    user: e2eViewer,
    roleName: "workspace.viewer",
    roleScope: "workspace",
  });
}

export async function ensureE2EPrivateMemberAssistant() {
  await ensureE2EMember();

  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const member = await client.query<{ id: string }>(
      `select id from "user" where email = $1 limit 1`,
      [e2eMember.email],
    );
    const workspace = await client.query<{ id: string }>(
      `select w.id
       from workspaces w
       join organizations o on o.id = w.organization_id
       where w.slug = 'main' and o.slug = 'deodis' and w.archived_at is null
       limit 1`,
    );
    const memberId = member.rows[0]?.id;
    const workspaceId = workspace.rows[0]?.id;
    if (!memberId || !workspaceId) {
      throw new Error("E2E private assistant owner is not initialized");
    }

    await client.query(
      `insert into agents
       (id, workspace_id, name, slug, visibility, created_by_user_id, created_at, updated_at)
       values ($1, $2, 'Member private assistant', 'e2e-member-private', 'private', $3, now(), now())
       on conflict (workspace_id, slug) do update
       set name = excluded.name,
           created_by_user_id = excluded.created_by_user_id,
           visibility = 'private',
           archived_at = null,
           updated_at = now()`,
      [randomUUID(), workspaceId, memberId],
    );
  } finally {
    await client.end();
  }
}

export async function ensureE2ETransferScenario() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(
      `select id from "user" where email = $1 limit 1`,
      [e2eUser.email],
    );
    const source = await client.query<{
      id: string;
      organization_id: string;
    }>(
      `select w.id, w.organization_id
       from workspaces w
       join organizations o on o.id = w.organization_id
       where w.slug = 'main' and o.slug = 'deodis'
       limit 1`,
    );
    const userId = user.rows[0]?.id;
    const sourceWorkspaceId = source.rows[0]?.id;
    const organizationId = source.rows[0]?.organization_id;
    if (!userId || !sourceWorkspaceId || !organizationId) {
      throw new Error("E2E transfer source is not initialized");
    }

    const destination = await client.query<{ id: string }>(
      `insert into workspaces
       (id, organization_id, name, slug, created_by_user_id, created_at, updated_at)
       values ($1, $2, 'Transfer destination', 'e2e-transfer', $3, now(), now())
       on conflict (organization_id, slug) do update
       set archived_at = null, updated_at = now()
       returning id`,
      [randomUUID(), organizationId, userId],
    );
    const targetWorkspaceId = destination.rows[0].id;
    const adminRole = await client.query<{ id: string }>(
      `select id from roles
       where name = 'workspace.admin' and is_system = true
       limit 1`,
    );
    await client.query(
      `insert into workspace_members
       (workspace_id, user_id, status, created_at, updated_at)
       values ($1, $2, 'active', now(), now())
       on conflict (workspace_id, user_id) do update
       set status = 'active', updated_at = now()`,
      [targetWorkspaceId, userId],
    );
    await client.query(
      `insert into role_bindings
       (principal_type, principal_id, role_id, resource_type, resource_id, created_by_user_id)
       values ('user', $1, $2, 'workspace', $3, $1)
       on conflict do nothing`,
      [userId, adminRole.rows[0].id, targetWorkspaceId],
    );
    await client.query(
      `delete from agents
       where workspace_id = $1 and slug = 'e2e-transfer-preview'`,
      [targetWorkspaceId],
    );
    await client.query(
      `insert into agents
       (id, workspace_id, name, slug, created_by_user_id, created_at, updated_at)
       values ($1, $2, 'Transfer preview assistant', 'e2e-transfer-preview', $3, now(), now())
       on conflict (workspace_id, slug) do update
       set name = excluded.name, archived_at = null, updated_at = now()`,
      [randomUUID(), sourceWorkspaceId, userId],
    );
    await client.query(
      `insert into agents
       (id, workspace_id, name, slug, created_by_user_id, created_at, updated_at)
       values ($1, $2, 'Removable assistant', 'e2e-delete-preview', $3, now(), now())
       on conflict (workspace_id, slug) do update
       set name = excluded.name, archived_at = null, updated_at = now()`,
      [randomUUID(), sourceWorkspaceId, userId],
    );

    const destinationOrganization = await client.query<{ id: string }>(
      `insert into organizations (id, name, slug, created_at, updated_at)
       values ($1, 'Transfer organization', 'e2e-transfer-organization', now(), now())
       on conflict (slug) do update
       set name = excluded.name, updated_at = now()
       returning id`,
      [randomUUID()],
    );
    const destinationOrganizationId = destinationOrganization.rows[0].id;
    const destinationOrganizationProject = await client.query<{ id: string }>(
      `insert into workspaces
       (id, organization_id, name, slug, created_by_user_id, created_at, updated_at)
       values ($1, $2, 'Destination main', 'main', $3, now(), now())
       on conflict (organization_id, slug) do update
       set name = excluded.name, archived_at = null, updated_at = now()
       returning id`,
      [randomUUID(), destinationOrganizationId, userId],
    );
    await client.query(
      `insert into organization_members
       (organization_id, user_id, status, created_at, updated_at)
       values ($1, $2, 'active', now(), now())
       on conflict (organization_id, user_id) do update
       set status = 'active', updated_at = now()`,
      [destinationOrganizationId, userId],
    );
    await client.query(
      `insert into workspace_members
       (workspace_id, user_id, status, created_at, updated_at)
       values ($1, $2, 'active', now(), now())
       on conflict (workspace_id, user_id) do update
       set status = 'active', updated_at = now()`,
      [destinationOrganizationProject.rows[0].id, userId],
    );
    const ownerRole = await client.query<{ id: string }>(
      `select id from roles
       where name = 'organization.owner' and is_system = true
       limit 1`,
    );
    await client.query(
      `insert into role_bindings
       (principal_type, principal_id, role_id, resource_type, resource_id, created_by_user_id)
       values
       ('user', $1, $2, 'organization', $3, $1),
       ('user', $1, $4, 'workspace', $5, $1)
       on conflict do nothing`,
      [
        userId,
        ownerRole.rows[0].id,
        destinationOrganizationId,
        adminRole.rows[0].id,
        destinationOrganizationProject.rows[0].id,
      ],
    );
  } finally {
    await client.end();
  }
}

export async function ensureE2ELifecycleProject() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(
      `select id from "user" where email = $1 limit 1`,
      [e2eUser.email],
    );
    const organization = await client.query<{ id: string }>(
      `select id from organizations where slug = 'deodis' limit 1`,
    );
    const adminRole = await client.query<{ id: string }>(
      `select id from roles
       where name = 'workspace.admin' and is_system = true
       limit 1`,
    );
    const userId = user.rows[0]?.id;
    const organizationId = organization.rows[0]?.id;
    if (!userId || !organizationId || !adminRole.rows[0]?.id) {
      throw new Error("E2E lifecycle scope is not initialized");
    }
    const project = await client.query<{ id: string }>(
      `insert into workspaces
       (id, organization_id, name, slug, created_by_user_id, created_at, updated_at)
       values ($1, $2, 'Lifecycle browser project', 'e2e-lifecycle', $3, now(), now())
       on conflict (organization_id, slug) do update
       set name = excluded.name, archived_at = null, updated_at = now()
       returning id`,
      [randomUUID(), organizationId, userId],
    );
    await client.query(
      `insert into workspace_members
       (workspace_id, user_id, status, created_at, updated_at)
       values ($1, $2, 'active', now(), now())
       on conflict (workspace_id, user_id) do update
       set status = 'active', updated_at = now()`,
      [project.rows[0].id, userId],
    );
    await client.query(
      `insert into role_bindings
       (principal_type, principal_id, role_id, resource_type, resource_id, created_by_user_id)
       values ('user', $1, $2, 'workspace', $3, $1)
       on conflict do nothing`,
      [userId, adminRole.rows[0].id, project.rows[0].id],
    );
  } finally {
    await client.end();
  }
}
