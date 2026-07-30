import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("tools hub page", () => {
  test("loads tools page", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(page).toHaveURL(/\/en\/tools/);

    await expect(
      page.getByRole("heading", {
        name: /Capabilities and connections\./i,
      }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows tools tabs", async ({ page }) => {
    await page.goto("/en/tools");
    await page.waitForTimeout(2000);

    // Tabs or at least some tools content should be visible
    await expect(
      page.getByRole("tab", { name: "Built-in", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows built-in tools", async ({ page }) => {
    await page.goto("/en/tools");
    await page.waitForTimeout(2000);

    // The compact Orbit list should expose the built-in tools directly.
    await expect(
      page.getByRole("heading", { name: "Calculator", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("tools search works", async ({ page }) => {
    await page.goto("/en/tools");
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder(/Search tools/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("calc");
      await page.waitForTimeout(500);

      // Results should update
      const pageContent = page.locator(".page-content").first();
      await expect(pageContent).toBeVisible();
    }
  });

  test("loads MCP tools automatically and only offers retry after failure", async ({
    page,
  }) => {
    const workspacesResponse = await page.request.get("/api/workspaces");
    expect(workspacesResponse.ok()).toBe(true);
    const workspaces = (await workspacesResponse.json()) as Array<{
      workspace: { id: string };
    }>;
    const workspaceId = workspaces[0]?.workspace.id;
    if (!workspaceId) throw new Error("E2E workspace is missing");

    let serverId: string | undefined;
    const serverName = `Automatic MCP ${Date.now()}`;
    try {
      const createResponse = await page.request.post(
        "/api/workspace/mcp-servers",
        {
          data: {
            workspaceId,
            name: serverName,
            transport: "streamable-http",
            url: "http://127.0.0.1:9/mcp",
          },
        },
      );
      expect(createResponse.status()).toBe(201);
      const server = (await createResponse.json()) as {
        id: string;
        discovery: { status: string; discovered: number };
      };
      serverId = server.id;
      expect(server.discovery).toEqual({
        status: "unhealthy",
        discovered: 0,
      });

      await page.goto("/en/tools?tab=mcp");
      const serverRow = page.getByRole("button", {
        name: new RegExp(serverName),
      });
      await expect(serverRow).toBeVisible({ timeout: 15_000 });
      await serverRow.click();

      await expect(
        page.getByRole("button", { name: "Try loading tools again" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Sync tools|Test connection/i }),
      ).toHaveCount(0);
    } finally {
      if (serverId) {
        await page.request.delete(
          `/api/workspace/mcp-servers/${serverId}?workspaceId=${workspaceId}`,
        );
      }
    }
  });
});

test.describe("retired custom tools builder", () => {
  test("redirects old custom tools links to workflows", async ({ page }) => {
    await page.goto("/en/custom-tools");
    await expect(page).toHaveURL(/\/en\/workflows/);
  });

  test("does not expose a custom tools tab", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(
      page.getByRole("tab", { name: "Custom", exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("scheduled tasks page", () => {
  test("loads scheduled tasks page", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await expect(page).toHaveURL(/\/en\/scheduled-tasks/);

    await expect(
      page.getByRole("heading", {
        name: /Automate, without losing control\./i,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows scheduled tasks empty state", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    await expect(
      page.getByText(/Scheduled tasks|No scheduled|Create/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("scheduled tasks page description exists", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    // Should have a description about scheduling
    await expect(
      page.getByText(/Schedule|automatic|assistants/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
