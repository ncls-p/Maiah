import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ensureE2EAssistant, ensureE2EUser, login } from "./fixtures";

test.beforeAll(ensureE2EUser);
test("Excel upload retains incident fields through retrieval and reindexing", async ({
  page,
  playwright,
}) => {
  test.setTimeout(120_000);
  await login(page);
  const { workspaceId } = await ensureE2EAssistant();
  await page.request.patch("/api/workspaces", { data: { workspaceId } });
  const name = `Excel ${randomUUID().slice(0, 8)}`;
  const create = await page.request.post("/api/workspace/knowledge-bases", {
    data: { workspaceId, name },
  });
  expect(create.status()).toBe(201);
  const base = await create.json();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("ITSM Incidents");
  sheet.addRow(["Number", "Description", "Assignment group"]);
  sheet.getRow(4).values = [
    "INC987654",
    "VPN authentication failure",
    "Network Support",
  ];
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  const title = "itsm-export.xlsx";
  const search = () =>
    page.request.post(`/api/workspace/knowledge-bases/${base.id}/search`, {
      data: { workspaceId, query: "INC987654" },
    });
  try {
    await page.goto("/en/knowledge");
    await page.getByRole("button").filter({ hasText: name }).click();
    await page.locator("#knowledge-file-upload").setInputFiles({
      name: title,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: bytes,
    });
    await expect
      .poll(
        async () => {
          const response = await search();
          return response.ok() ? (await response.json()).length : 0;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
    const hits = await (await search()).json();
    expect(hits[0].content).toContain('Sheet "ITSM Incidents"; Excel row 4');
    expect(hits[0].content).toContain('A "Number": INC987654');
    expect(hits[0].content).toContain('C "Assignment group": Network Support');
    await page.getByRole("button", { name: title, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    const rawUrl = await dialog
      .getByRole("link", { name: "Download original" })
      .getAttribute("href");
    expect(rawUrl).toBeTruthy();
    const original = await page.request.get(rawUrl!);
    expect(original.status(), original.url()).toBe(200);
    expect(original.headers()["content-type"]).toContain("spreadsheetml");
    expect(await original.body()).toEqual(bytes);
    const anonymous = await playwright.request.newContext();
    try {
      expect((await anonymous.get(rawUrl!)).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    const indexedUrl = rawUrl!.replace("/raw?", "?").replace("&download=1", "");
    const response = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().endsWith(indexedUrl),
    );
    await page
      .getByRole("button", { name: `Reindex ${title}`, exact: true })
      .click();
    expect((await response).ok()).toBeTruthy();
    await expect
      .poll(async () => (await page.request.get(indexedUrl)).status(), {
        timeout: 60_000,
      })
      .toBe(200);
    expect((await (await search()).json())[0].content).toEqual(hits[0].content);
  } finally {
    await page.request.delete(
      `/api/workspace/knowledge-bases/${base.id}?workspaceId=${workspaceId}`,
    );
  }
});
