import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  ensureE2EAssistant,
  login,
  loginWithCredentials,
  databaseUrl,
} from "./fixtures";
import { ensureE2EPermissionUser } from "./fixtures.ensure-e2-emember";

test("application analytics, precise filters, merged charts, exports and organization-admin branding isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const { workspaceId } = await ensureE2EAssistant();
  await login(page);
  const sql = new Client({ connectionString: databaseUrl() });
  await sql.connect();
  const org = (
    await sql.query("select organization_id from workspaces where id=$1", [
      workspaceId,
    ])
  ).rows[0].organization_id;
  const person = {
    name: "Analytics organization admin",
    email: `analytics-admin-${randomUUID()}@example.test`,
    password: "Analytics-test-pass-2026!",
  };
  await ensureE2EPermissionUser({
    user: person,
    roleName: "organization.admin",
    roleScope: "organization",
  });
  const userId = (
    await sql.query('select id from "user" where email=$1', [person.email])
  ).rows[0].id;
  const foreign = await page.request.post("/api/organizations", {
    data: {
      action: "createOrganization",
      name: `Analytics foreign ${randomUUID().slice(0, 8)}`,
    },
  });
  expect(foreign.ok()).toBe(true);
  const foreignOrg = (await foreign.json()).organization.id;
  const operation = `analytics-${randomUUID().slice(0, 8)}`;
  const context = await browser.newContext();
  const admin = await context.newPage();
  const before = await (
    await page.request.get(`/api/workspace/branding?organizationId=${org}`)
  ).json();
  try {
    await sql.query(
      "insert into usage_events(workspace_id,user_id,operation,input_tokens,output_tokens,cost_usd,status,created_at) select $1,$2,$3,100,20,'0.01','success',now()-interval '1 day' from generate_series(1,75)",
      [workspaceId, userId, operation],
    );
    await sql.query(
      "insert into audit_events(organization_id,actor_principal_id,action,outcome) values($1,$2,$3,'denied')",
      [org, userId, operation],
    );
    await page.goto("/en/usage");
    await expect(
      page.getByRole("heading", { name: "Usage and costs", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Scope", exact: true }),
    ).toContainText("Entire application");
    await page.getByText("Detailed filters", { exact: true }).click();
    await page.getByLabel("Operation", { exact: true }).fill(operation);
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(
      page.getByText("1–50 of 75 events", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Visualization", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Add together", exact: true })
      .click();
    await expect(
      page.getByText("Selected series total", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByText("51–75 of 75 events", { exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Export filtered events (CSV)",
        exact: true,
      })
      .click();
    expect((await download).suggestedFilename()).toBe("usage.csv");
    await page
      .getByRole("heading", { name: "Usage and costs", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/maiah-analytics-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("heading", { name: "Usage and costs", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/maiah-analytics-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await loginWithCredentials(admin, person);
    const scopes = await (
      await admin.request.get("/api/analytics/scopes?kind=usage")
    ).json();
    expect(
      scopes.scopes.some(
        (scope: { type: string }) => scope.type === "application",
      ),
    ).toBe(false);
    expect(
      scopes.scopes.some((scope: { id: string }) => scope.id === org),
    ).toBe(true);
    for (const kind of ["usage", "audit"]) {
      expect(
        (
          await admin.request.get(`/api/analytics/${kind}?scope=application`)
        ).status(),
      ).toBe(403);
      expect(
        (
          await admin.request.get(
            `/api/analytics/${kind}?scope=organization&scopeId=${foreignOrg}`,
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await admin.request.get(
            `/api/analytics/${kind}?scope=organization&scopeId=${org}`,
          )
        ).status(),
      ).toBe(200);
    }
    await admin.goto("/en/audit");
    await admin.getByRole("combobox", { name: "Scope", exact: true }).click();
    await admin
      .getByRole("option", {
        name: new RegExp(`Organization.*${org.slice(0, 6)}`),
      })
      .click();
    await admin.getByText("Detailed filters", { exact: true }).click();
    await admin.getByLabel("Exact action", { exact: true }).fill(operation);
    await admin
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(
      admin.getByText("1–1 of 1 events", { exact: true }),
    ).toBeVisible();
    await admin.getByText(operation, { exact: true }).click();
    await expect(admin.getByText(person.email, { exact: true })).toBeVisible();
    await admin.route(
      "**/api/analytics/audit?**",
      (route) => route.fulfill({ status: 503, json: { error: "Retry" } }),
      { times: 1 },
    );
    await admin
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(
      admin.getByRole("alert").filter({ hasText: "Unable to load" }),
    ).toContainText("Unable to load");
    await expect(admin.getByText(operation, { exact: true })).toHaveCount(0);
    await admin.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      admin.getByText("1–1 of 1 events", { exact: true }),
    ).toBeVisible();
    const body = {
      organizationId: org,
      theme: "forest",
      logoUrl: before.logoUrl,
      themeConfig: null,
      heroConfig: before.heroConfig,
    };
    expect(
      (
        await admin.request.put("/api/workspace/branding", { data: body })
      ).status(),
    ).toBe(200);
    expect(
      (
        await admin.request.put("/api/workspace/branding", {
          data: { ...body, organizationId: foreignOrg },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await admin.request.patch(
          `/api/admin/chat-automation?organizationId=${foreignOrg}`,
          {
            data: {
              enabled: false,
              generateTitles: false,
              generateSuggestions: false,
            },
          },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.request.patch(
          `/api/admin/sidebar-navigation?organizationId=${foreignOrg}`,
          { data: { items: [{ id: "/chat", visible: true }] } },
        )
      ).status(),
    ).toBe(403);
    await admin.goto("/en/admin/settings/branding");
    const section = admin.getByRole("region", {
      name: "Organization",
      exact: true,
    });
    await expect(
      section.getByText("Organization branding", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole("combobox", {
        name: "Organization",
        exact: true,
      }),
    ).not.toContainText("Analytics foreign");
    await section
      .getByLabel("Organization name", { exact: true })
      .fill("Analytics renamed organization");
    await section
      .getByRole("button", { name: "Save branding", exact: true })
      .click();
    await expect(
      section.getByRole("combobox", {
        name: "Organization",
        exact: true,
      }),
    ).toContainText("Analytics renamed organization");
    expect(
      (
        await (
          await admin.request.get(
            `/api/workspace/branding?organizationId=${org}`,
          )
        ).json()
      ).organizationName,
    ).toBe("Analytics renamed organization");
    expect(
      (
        await (
          await page.request.get(
            `/api/workspace/branding?organizationId=${foreignOrg}`,
          )
        ).json()
      ).theme,
    ).toBe("ocean");
  } finally {
    await page.request.put("/api/workspace/branding", {
      data: {
        organizationId: org,
        organizationName: before.organizationName,
        theme: before.theme,
        logoUrl: before.logoUrl,
        themeConfig: before.themeConfig,
        heroConfig: before.heroConfig,
      },
    });
    await context.close();
    await sql.query("delete from usage_events where operation=$1", [operation]);
    await sql.query("delete from audit_events where action=$1", [operation]);
    await sql.query("delete from organizations where id=$1", [foreignOrg]);
    await sql.query("delete from role_bindings where principal_id=$1", [
      userId,
    ]);
    await sql.query('delete from "user" where id=$1', [userId]);
    await sql.end();
  }
});
