// Shared fixtures and helpers for all e2e tests
import { expect, type Cookie, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

export const e2eUser = {
  name: "E2E Admin",
  email: "e2e-admin@example.test",
  password: "Password123!",
};

export const e2eMember = {
  name: "E2E Member",
  email: "e2e-member@example.test",
  password: "Password123!",
};

let authenticatedCookies: Cookie[] | null = null;

export function databaseUrl() {
  return (
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:15432/ai_hub"
  );
}

export async function ensureE2EUser() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const upserted = await client.query<{ id: string }>(
      `insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
       values ($1, $2, $3, true, $4, false, now(), now())
       on conflict (email) do update
       set name = excluded.name, role = excluded.role, banned = false, updated_at = now()
       returning id`,
      [randomUUID(), e2eUser.name, e2eUser.email, "admin"],
    );
    const userId = upserted.rows[0].id;

    const password = await hashPassword(e2eUser.password);
    await client.query(
      "delete from account where account_id = $1 and provider_id = 'credential'",
      [userId],
    );
    await client.query(
      "insert into account (account_id, provider_id, user_id, password, created_at, updated_at) values ($1, 'credential', $2, $3, now(), now())",
      [userId, userId, password],
    );
    await client.query(
      `insert into app_settings (key, value_json, updated_by_user_id, updated_at)
			 values ($1, $2::jsonb, $3, now())
			 on conflict (key) do update
			 set value_json = excluded.value_json,
			     updated_by_user_id = excluded.updated_by_user_id,
			     updated_at = now()`,
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

export async function ensureE2EAssistant() {
  await ensureE2EUser();

  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(
      `select id from "user" where email = $1 limit 1`,
      [e2eUser.email],
    );
    const workspace = await client.query<{ id: string }>(
      `select w.id
       from workspaces w
       join organizations o on o.id = w.organization_id
       where w.slug = 'main' and o.slug = 'deodis' and w.archived_at is null
       limit 1`,
    );
    const userId = user.rows[0]?.id;
    const workspaceId = workspace.rows[0]?.id;
    if (!userId || !workspaceId) {
      throw new Error("E2E assistant workspace is not initialized");
    }

    await client.query(
      `insert into agents
       (id, workspace_id, name, slug, created_by_user_id, created_at, updated_at)
       values ($1, $2, 'E2E menu assistant', 'e2e-menu-assistant', $3, now(), now())
       on conflict (workspace_id, slug) do update
       set name = excluded.name,
           created_by_user_id = excluded.created_by_user_id,
           archived_at = null,
           updated_at = now()`,
      [randomUUID(), workspaceId, userId],
    );
  } finally {
    await client.end();
  }
}

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
    const workspace = await client.query<{ id: string }>(
      `select w.id
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
    const roleId = memberRole.rows[0]?.id;
    if (!workspaceId || !roleId) {
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
      `insert into workspace_members (workspace_id, user_id, status, created_at, updated_at)
       values ($1, $2, 'active', now(), now())
       on conflict (workspace_id, user_id) do update
       set status = 'active', updated_at = now()`,
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
  } finally {
    await client.end();
  }
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

export async function loginWithCredentials(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/en/auth/signin");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/en\/(chat|setup)/, { timeout: 15_000 });
}

export async function login(page: Page) {
  if (authenticatedCookies) {
    await page.context().addCookies(authenticatedCookies);
    await page.goto("/en/chat", { waitUntil: "domcontentloaded" });
    if (/\/en\/(chat|setup)/.test(page.url())) return;
    authenticatedCookies = null;
  }

  await page.goto("/en/auth/signin");
  await page.getByLabel("Email").fill(e2eUser.email);
  await page.getByLabel("Password").fill(e2eUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/en\/(chat|setup)/, { timeout: 15_000 });
  authenticatedCookies = await page.context().cookies();
}

export { expect };
