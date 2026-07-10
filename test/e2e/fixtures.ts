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
