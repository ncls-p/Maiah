import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import {
  uploadCodeWorkspace,
  WORKBENCH_VERSION,
  WORKSPACE_VERSION,
} from "./code-workspace-fixtures";
import { ensureE2EUser, login } from "./fixtures";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("code workspace windows", () => {
  // The test uploads a real workspace and drives three browser windows.
  test.describe.configure({ timeout: 120_000 });

  test("pops the preview and the editor out to separate windows and colours every file", async ({
    context,
    page,
  }) => {
    const conversationId = await uploadCodeWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/chat?conversationId=${conversationId}`);
    const version = page.getByText(WORKSPACE_VERSION);
    await expect(version).toBeVisible({ timeout: 30_000 });
    const versionBefore = Number(
      (await version.textContent())!.match(/v(\d+)/)![1],
    );
    await page.getByRole("button", { name: "Coding" }).click();

    const [preview] = await Promise.all([
      context.waitForEvent("page"),
      page
        .getByRole("button", { name: "Open the preview in a new window" })
        .first()
        .click(),
    ]);
    await preview.waitForLoadState();
    expect(preview.url()).toMatch(/\/en\/code-workspace\/[0-9a-f-]+\/preview/);
    const previewTitle = preview.frameLocator("iframe").locator("h1#title");
    await expect(previewTitle).toHaveText("Popout demo", { timeout: 30_000 });
    await expect(previewTitle).toHaveAttribute("data-ready", "1");

    const [editor] = await Promise.all([
      context.waitForEvent("page"),
      page
        .getByRole("button", { name: "Open the workspace in a new window" })
        .first()
        .click(),
    ]);
    await editor.waitForLoadState();
    expect(editor.url()).toMatch(/\/en\/code-workspace\/[0-9a-f-]+/);
    await expect(editor.getByText(WORKBENCH_VERSION)).toBeVisible({
      timeout: 30_000,
    });
    // A pop-out never offers to pop itself out again.
    await expect(
      editor.getByRole("button", {
        name: "Open the workspace in a new window",
      }),
    ).toHaveCount(0);

    // Every text file gets syntax colours, not only HTML/CSS/JS.
    for (const file of [
      "storage_model.ts",
      "main.py",
      "styles.css",
      "app.js",
      "index.html",
    ]) {
      await editor.getByRole("button", { name: new RegExp(file) }).click();
      await expect
        .poll(
          () =>
            editor.evaluate(() => {
              const pre = document.querySelector("pre[aria-hidden]");
              if (!pre) return 0;
              return new Set(
                Array.from(pre.querySelectorAll("span")).map(
                  (span) => getComputedStyle(span).color,
                ),
              ).size;
            }),
          { message: `${file} should be highlighted`, timeout: 15_000 },
        )
        .toBeGreaterThanOrEqual(3);
    }

    // Saving in the pop-out editor refreshes the chat and the preview window.
    await editor.getByRole("button", { name: /styles\.css/ }).click();
    await editor
      .locator("textarea")
      .first()
      .fill("h1 { color: rgb(185, 28, 28); }\n");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor.getByText(WORKBENCH_VERSION)).not.toContainText(
      `v${versionBefore} ·`,
      { timeout: 15_000 },
    );
    await expect(page.getByText(WORKSPACE_VERSION)).not.toHaveText(
      `Code workspace · v${versionBefore}`,
      { timeout: 15_000 },
    );
    await expect
      .poll(
        () =>
          previewTitle.evaluate((element) => getComputedStyle(element).color),
        { timeout: 30_000 },
      )
      .toBe("rgb(185, 28, 28)");
  });
});
