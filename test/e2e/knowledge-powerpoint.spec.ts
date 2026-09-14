import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ensureE2EAssistant, ensureE2EUser, login } from "./fixtures";

test.beforeAll(ensureE2EUser);
test("PowerPoint preview, indexed text, download and original re-extraction", async ({
  page,
  playwright,
}) => {
  test.skip(
    !process.env.DOCUMENT_CONVERTER_URL,
    "Requires the private document converter",
  );
  test.setTimeout(120_000);
  await login(page);
  const { workspaceId } = await ensureE2EAssistant();
  await page.request.patch("/api/workspaces", { data: { workspaceId } });
  const name = `PowerPoint ${randomUUID().slice(0, 8)}`;
  const create = await page.request.post("/api/workspace/knowledge-bases", {
    data: { workspaceId, name },
  });
  expect(create.status()).toBe(201);
  const base = await create.json();
  try {
    await page.goto("/en/knowledge");
    await page.getByRole("button").filter({ hasText: name }).click();
    await page
      .locator("#knowledge-file-upload")
      .setInputFiles("test/fixtures/presentation-rag.pptx");
    const title = "presentation-rag.pptx";
    await expect(
      page.getByRole("progressbar", {
        name: `Processing progress for ${title}`,
      }),
    ).toHaveAttribute("aria-valuenow", "100", { timeout: 60_000 });
    await page.getByRole("button", { name: title, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog.locator("iframe")).toHaveAttribute("src", /^blob:/, {
      timeout: 80_000,
    });
    const rawUrl = await dialog
      .getByRole("link", { name: "Download original" })
      .getAttribute("href");
    expect(rawUrl).toBeTruthy();
    const original = await page.request.get(rawUrl!);
    expect(original.headers()["content-type"]).toContain("presentationml");
    expect((await original.body()).subarray(0, 2).toString()).toBe("PK");
    const anonymous = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    });
    try {
      const denied = await anonymous.get(
        rawUrl!.replace("download=1", "preview=pdf"),
      );
      expect(denied.status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
    await dialog
      .getByRole("button", { name: "Indexed text", exact: true })
      .click();
    await expect(dialog.locator("pre")).toContainText(
      "vérifier la validation qualité",
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    const indexedUrl = rawUrl!.replace("/raw?", "?").replace("&download=1", "");
    const reindexResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(indexedUrl),
    );
    await page
      .getByRole("button", { name: `Reindex ${title}`, exact: true })
      .click();
    expect((await reindexResponse).ok()).toBeTruthy();
    // The old 100% progress can remain visible until the next UI poll.
    // The read endpoint only exposes chunks once the worker has finished.
    await expect
      .poll(async () => (await page.request.get(indexedUrl)).status(), {
        timeout: 60_000,
      })
      .toBe(200);
    await expect(
      page.getByRole("progressbar", {
        name: `Processing progress for ${title}`,
      }),
    ).toHaveAttribute("aria-valuenow", "100", { timeout: 60_000 });
    await page.getByRole("button", { name: title, exact: true }).click();
    await dialog
      .getByRole("button", { name: "Indexed text", exact: true })
      .click();
    await expect(dialog.locator("pre")).toContainText("120 kWh");
  } finally {
    await page.request.delete(
      `/api/workspace/knowledge-bases/${base.id}?workspaceId=${workspaceId}`,
    );
  }
});
