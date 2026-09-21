import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { verifyPassword } from "better-auth/crypto";
import {
  databaseUrl,
  e2eMember,
  ensureE2EMember,
  ensureE2EUser,
  login,
  loginWithCredentials,
} from "./fixtures";

const endpoint = "/api/auth/admin/set-user-password";
const newPassword = "New-admin-password-42!";

test("only admins can set a user's password from the people list", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await ensureE2EUser();
  await login(page);
  await page.request.post("/api/workspaces");
  await ensureE2EMember();
  const sql = new Client({ connectionString: databaseUrl() });
  await sql.connect();
  const memberContext = await browser.newContext();
  const anonymous = await browser.newContext();
  try {
    const {
      rows: [member],
    } = await sql.query('select id from "user" where email=$1', [
      e2eMember.email,
    ]);
    const payload = { userId: member.id, newPassword };
    const headers = { Origin: new URL(page.url()).origin };
    expect(
      (
        await anonymous.request.post(endpoint, { data: payload, headers })
      ).status(),
    ).toBe(401);
    const memberPage = await memberContext.newPage();
    await loginWithCredentials(memberPage, e2eMember);
    expect(
      (
        await memberPage.request.post(endpoint, { data: payload, headers })
      ).status(),
    ).toBe(403);
    for (const invalid of ["short", "x".repeat(129)]) {
      expect(
        (
          await page.request.post(endpoint, {
            headers,
            data: { ...payload, newPassword: invalid },
          })
        ).status(),
      ).toBe(400);
    }
    expect(
      (
        await page.request.post(endpoint, {
          headers: { Origin: "https://untrusted.example" },
          data: payload,
        })
      ).status(),
    ).toBe(403);

    await page.goto("/en/members");
    await page.locator("#people-search").fill(e2eMember.email);
    async function openDialog() {
      await page
        .getByRole("button", {
          name: `Actions for ${e2eMember.name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitem", { name: "Set password", exact: true })
        .click();
    }
    await openDialog();
    const dialog = page.getByRole("dialog", {
      name: "Set password",
      exact: true,
    });
    await expect(dialog).toContainText(e2eMember.email);
    const password = dialog.getByLabel("New password", { exact: true });
    const confirmation = dialog.getByLabel("Confirm password", { exact: true });
    const save = dialog.getByRole("button", {
      name: "Save password",
      exact: true,
    });
    await expect(save).toBeDisabled();
    await password.fill(newPassword);
    await confirmation.fill("different-password");
    await expect(save).toBeDisabled();
    await expect(confirmation).toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await openDialog();
    await expect(password).toHaveValue("");
    await expect(confirmation).toHaveValue("");
    await password.fill(newPassword);
    await confirmation.fill(newPassword);
    await page.route(
      `**${endpoint}`,
      (route) =>
        route.fulfill({ status: 503, json: { message: "Unavailable" } }),
      { times: 1 },
    );
    await save.click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(password).toHaveValue(newPassword);
    await save.click();
    await expect(dialog).not.toBeVisible();
    await openDialog();
    await expect(password).toHaveValue("");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    const {
      rows: [account],
    } = await sql.query(
      "select password from account where user_id=$1 and provider_id='credential'",
      [member.id],
    );
    expect(account.password).not.toBe(newPassword);
    expect(
      await verifyPassword({ hash: account.password, password: newPassword }),
    ).toBe(true);
    const oldLogin = await anonymous.request.post("/api/auth/sign-in/email", {
      data: { email: e2eMember.email, password: e2eMember.password },
    });
    expect(oldLogin.status()).toBe(401);
    const newLogin = await anonymous.request.post("/api/auth/sign-in/email", {
      data: { email: e2eMember.email, password: newPassword },
    });
    expect(newLogin.ok()).toBe(true);
  } finally {
    await ensureE2EMember();
    await memberContext.close();
    await anonymous.close();
    await sql.end();
  }
});
