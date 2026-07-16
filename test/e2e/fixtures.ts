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
      `select id from workspaces where slug = 'main' and archived_at is null limit 1`,
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
