import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import {
  connectPortability,
  connectionSchema,
} from "@/modules/data-portability/context";

// Explicit opt-in: these tests use ONLY the disposable DEO-62 databases/buckets.
test.skip(
  process.env.PORTABILITY_UI_E2E !== "1",
  "Requires two disposable local instances; see docs/operations/data-portability.md",
);
const sourceUrl = "http://localhost:31462",
  targetUrl = "http://localhost:31463";
async function login(page: Page, url: string, email: string) {
  await page.goto(`${url}/en/auth/signin`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Password123!");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForURL(/\/en\/(chat|setup)/, { timeout: 30_000 });
}
test("download organization on A, preview/import on B, verify secrets/files and deny unauthorized export", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const pool = new Pool({
    connectionString:
      "postgres://postgres:deo62-local-only@127.0.0.1:15462/deo62_ui_source",
  });
  const organizationId = (
    await pool.query("select id from organizations where slug = 'portable'")
  ).rows[0].id;
  const assets = (
    await pool.query(
      "select metadata_json from message_parts where type = 'file' limit 1",
    )
  ).rows[0].metadata_json;
  await pool.end();
  const sourceContext = await browser.newContext();
  const targetContext = await browser.newContext();
  try {
    const source = await sourceContext.newPage(),
      target = await targetContext.newPage();
    await login(source, sourceUrl, "migration@example.test");
    await source.goto(
      `${sourceUrl}/en/admin/settings/organization-data?organizationId=${organizationId}`,
    );
    await source
      .getByLabel("Archive passphrase")
      .fill("browser-test-secret-passphrase");
    const downloadPromise = source.waitForEvent("download");
    await source
      .getByRole("button", { name: "Download encrypted archive" })
      .click();
    const download = await downloadPromise;
    const archive = testInfo.outputPath("organization.maiah");
    await download.saveAs(archive);
    expect((await readFile(archive)).subarray(0, 8).toString()).toBe(
      "MAIAHD01",
    );
    await login(target, targetUrl, "target-admin@example.test");
    await target.goto(`${targetUrl}/en/admin/settings/data`);
    await target
      .getByLabel("Archive passphrase")
      .fill("browser-test-secret-passphrase");
    await target.getByLabel("Archive to import").setInputFiles(archive);
    await target.getByRole("button", { name: "Validate and preview" }).click();
    await expect(target.getByText(/records and 5 files validated/)).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(
      target.getByRole("button", { name: "Confirm import", exact: true }),
    ).toBeDisabled();
    await target
      .getByLabel("Type IMPORT to confirm restoration")
      .fill("IMPORT");
    await target
      .getByRole("button", { name: "Confirm import", exact: true })
      .click();
    await expect(target.getByText(/Import complete\. Verify/)).toBeVisible({
      timeout: 30_000,
    });
    await target.screenshot({
      path: testInfo.outputPath("import-complete.png"),
      fullPage: true,
    });
    let config;
    try {
      config = connectionSchema.parse(
        JSON.parse(await readFile("/tmp/deo62-target.json", "utf8")),
      );
    } catch {
      throw new Error("Missing private disposable target configuration");
    }
    const connection = connectPortability(config);
    try {
      const result = await connection.context.pool.query(
        "select encrypted_data from mcp_oauth_credentials",
      );
      expect(
        await connection.context.secrets.decrypt(result.rows[0].encrypted_data),
      ).toBe("portable-secret-not-for-logs");
      expect(await connection.context.objects.list()).toHaveLength(5);
      expect(
        (
          await connection.context.pool.query(
            "select count(*) from usage_events",
          )
        ).rows[0].count,
      ).toBe("1");
      expect(
        (
          await connection.context.pool.query(
            "select enabled from scheduled_tasks",
          )
        ).rows[0].enabled,
      ).toBe(false);
    } finally {
      await connection.close();
    }
    const anonymous = await browser.newContext();
    const denied = await anonymous.request.post(
      `${targetUrl}/api/admin/data-portability`,
      { headers: { origin: targetUrl } },
    );
    expect(denied.status()).toBe(401);
    await anonymous.close();
    // Source user becomes an org owner on B, never a platform administrator.
    const memberContext = await browser.newContext();
    const member = await memberContext.newPage();
    await login(member, targetUrl, "migration@example.test");
    const forbidden = await memberContext.request.post(
      `${targetUrl}/api/admin/data-portability`,
      { headers: { origin: targetUrl } },
    );
    expect(forbidden.status()).toBe(403);
    const attachment = await memberContext.request.get(
      `${targetUrl}/api/workspace/chat-attachments/${assets.attachmentId}`,
    );
    expect(attachment.status()).toBe(200);
    expect(await attachment.body()).toEqual(
      Buffer.from("Portable binary\0\xff", "latin1"),
    );
    const project = await memberContext.request.get(
      `${targetUrl}/api/workspace/code-projects/${assets.projectId}/download`,
    );
    expect(project.status()).toBe(200);
    expect((await project.body()).subarray(0, 2).toString()).toBe("PK");
    await memberContext.close();
  } finally {
    await sourceContext.close();
    await targetContext.close();
  }
});
