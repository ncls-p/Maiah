import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("tools hub page", () => {
  test("keeps a large skills library compact and searchable", async ({
    page,
  }) => {
    const skills = Array.from({ length: 55 }, (_, index) => {
      const number = String(index + 1).padStart(3, "0");
      return {
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: `Skill ${number}`,
        description: `Reusable instructions for workflow ${number}.`,
        sourcePackage: index % 2 === 0 ? "owner/skills" : null,
        sourceSkillName: index % 2 === 0 ? `skill-${number}` : null,
        installCommand: index % 2 === 0 ? "npx skills add owner/skills" : null,
        markdownFilesJson: [{ path: "SKILL.md", content: `# Skill ${number}` }],
        metadataJson: {},
        isGlobal: index % 3 === 0,
        canEdit: true,
        createdAt: new Date().toISOString(),
        provenance: {
          scope: index % 3 === 0 ? "organization" : "user",
          scopeName: index % 3 === 0 ? "E2E organization" : "E2E Admin",
          ownerName: "E2E Admin",
        },
      };
    });
    await page.route(/\/api\/workspace\/skills\?/, async (route) => {
      await route.fulfill({ json: skills });
    });

    await page.goto("/en/tools?tab=skills");
    const skillRows = page.getByRole("listitem");
    await expect(skillRows).toHaveCount(24);
    await expect(page.getByText(/Showing 24 of 55 skills/i)).toBeVisible();

    await page.getByRole("button", { name: /Show next 24/i }).click();
    await expect(skillRows).toHaveCount(48);

    const search = page.getByRole("searchbox", { name: /Search skills/i });
    await search.fill("Skill 053");
    await expect(skillRows).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Skill 053", exact: true }),
    ).toBeVisible();
  });
  test("groups skill installation and manual creation under one action", async ({
    page,
  }) => {
    await page.goto("/en/tools?tab=skills");

    await page.getByRole("button", { name: /^Add$/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /Install from skills\.sh/i }),
    ).toBeVisible();
    await page
      .getByRole("menuitem", { name: /Install from skills\.sh/i })
      .click();
    await expect(
      page.getByRole("dialog", { name: /Install from skills\.sh/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Close/i }).click();

    await page.getByRole("button", { name: /^Add$/i }).click();
    await page.getByRole("menuitem", { name: /Create manually/i }).click();
    await expect(
      page.getByRole("dialog", { name: /Create skill/i }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Name$/i })).toBeFocused();
  });
  test("keeps a large MCP server library compact and searchable", async ({
    page,
  }) => {
    const servers = Array.from({ length: 55 }, (_, index) => {
      const number = String(index + 1).padStart(3, "0");
      return {
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: `MCP server ${number}`,
        transport: "streamable-http",
        url: `https://mcp-${number}.example.test/mcp`,
        command: null,
        healthStatus: "healthy",
        enabled: index % 5 !== 0,
        requireApproval: false,
        isGlobal: index % 3 === 0,
        canEdit: true,
        hasHeaders: false,
        hasEnv: false,
        provenance: {
          scope: index % 3 === 0 ? "organization" : "user",
          scopeName: index % 3 === 0 ? "E2E organization" : "E2E Admin",
          ownerName: "E2E Admin",
        },
      };
    });

    await page.route(/\/api\/workspace\/mcp-servers\?/, async (route) => {
      await route.fulfill({ json: servers });
    });
    await page.route(
      /\/api\/workspace\/mcp-servers\/[^/]+\/tools\?/,
      async (route) => {
        await route.fulfill({ json: [] });
      },
    );

    await page.goto("/en/tools?tab=mcp");
    await expect(
      page.getByText(/24 of 55 shown · 55 servers configured/i),
    ).toBeVisible();
    await expect(page.getByText(/^MCP server \d{3}$/)).toHaveCount(24);

    await page.getByRole("button", { name: /Show 24 more/i }).click();
    await expect(page.getByText(/^MCP server \d{3}$/)).toHaveCount(48);

    const search = page.getByRole("searchbox", {
      name: /Filter servers/i,
    });
    await search.fill("MCP server 053");
    await expect(page.getByText(/^MCP server \d{3}$/)).toHaveCount(1);
    await expect(
      page.getByText("MCP server 053", { exact: true }),
    ).toBeVisible();
  });
  test("opens private MCP connections only on request", async ({ page }) => {
    await page.goto("/en/tools?tab=mcp");

    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Connections", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Personal credentials stay private/i),
    ).toBeVisible();
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
