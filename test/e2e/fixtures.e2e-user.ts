// Shared fixtures and helpers for all e2e tests
import type { Cookie, Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { cache } from "@/server/infrastructure/cache";

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

export const e2eAccessManager = {
  name: "E2E Access Manager",
  email: "e2e-access-manager@example.test",
  password: "Password123!",
};

export const e2eOrganizationAdmin = {
  name: "E2E Organization Admin",
  email: "e2e-organization-admin@example.test",
  password: "Password123!",
};

export const e2eOrganizationProjectEditor = {
  name: "E2E Organization Project Editor",
  email: "e2e-org-project-editor@example.test",
  password: "Password123!",
};

export const e2eViewer = {
  name: "E2E Project Viewer",
  email: "e2e-project-viewer@example.test",
  password: "Password123!",
};

export const authenticationState: { cookies: Cookie[] | null } = {
  cookies: null,
};

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
    await cache.delByPrefix(`perm:${userId}:`);
  } finally {
    await client.end();
  }
}

export async function ensureE2EAssistant() {
  await ensureE2EUser();

  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const providerId = "10000000-0000-4000-8000-000000000001";
    const modelId = "10000000-0000-4000-8000-000000000002";
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
      `insert into ai_providers
       (id, workspace_id, kind, name, base_url, auth_type, enabled,
        created_by_user_id, created_at, updated_at)
       values ($1, $2, 'openai-compatible', 'E2E provider',
               'http://127.0.0.1:9/v1', 'bearer', true, $3, now(), now())
       on conflict (id) do update
       set workspace_id = excluded.workspace_id,
           enabled = true,
           archived_at = null,
           updated_at = now()`,
      [providerId, workspaceId, userId],
    );
    await client.query(
      `insert into ai_models
       (id, provider_id, model_id, display_name, enabled, created_at, updated_at)
       values ($1, $2, 'e2e-model', 'E2E model', true, now(), now())
       on conflict (provider_id, model_id) do update
       set display_name = excluded.display_name,
           enabled = true,
           updated_at = now()`,
      [modelId, providerId],
    );
    const assistant = await client.query<{ id: string }>(
      `insert into agents
       (id, workspace_id, name, slug, visibility, sharing_mode, created_by_user_id, created_at, updated_at)
       values ($1, $2, 'E2E menu assistant', 'e2e-menu-assistant', 'workspace', 'marketplace', $3, now(), now())
       on conflict (workspace_id, slug) do update
       set name = excluded.name,
           created_by_user_id = excluded.created_by_user_id,
           visibility = 'workspace',
           sharing_mode = 'marketplace',
           archived_at = null,
           updated_at = now()
       returning id`,
      [randomUUID(), workspaceId, userId],
    );
    const agentId = assistant.rows[0]?.id;
    if (!agentId) {
      throw new Error("E2E assistant could not be initialized");
    }
    const version = await client.query<{ id: string }>(
      `insert into agent_versions
       (id, agent_id, version_number, name, system_prompt, provider_id, model_id,
        created_by_user_id, created_at)
       values ($1, $2, 1, 'E2E version', 'You are an E2E test assistant.',
               $3, $4, $5, now())
       on conflict (agent_id, version_number) do update
       set name = excluded.name,
           system_prompt = excluded.system_prompt,
           provider_id = excluded.provider_id,
           model_id = excluded.model_id
       returning id`,
      [randomUUID(), agentId, providerId, modelId, userId],
    );
    await client.query(
      `update agents
       set active_version_id = $1, updated_at = now()
       where id = $2`,
      [version.rows[0].id, agentId],
    );
    return { agentId, workspaceId };
  } finally {
    await client.end();
  }
}
