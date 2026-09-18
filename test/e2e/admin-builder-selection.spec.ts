import { test, expect } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";
test("saves an assistant requiring model configuration as the organization builder", async ({
  page,
}) => {
  await ensureE2EUser();
  await login(page);
  await page.request.post("/api/workspaces");
  const rows = await (await page.request.get("/api/workspaces")).json();
  const { workspace } =
    rows.find((row: { isActive: boolean }) => row.isActive) ?? rows[0];
  const endpoint = `/api/admin/workflow-builder?organizationId=${workspace.organizationId}`;
  const previous = await (await page.request.get(endpoint)).json();
  const name = `Builder requiring setup ${Date.now()}`;
  const response = await page.request.post("/api/workspace/agents", {
    data: { workspaceId: workspace.id, name },
  });
  expect(response.status()).toBe(201);
  const { agent } = await response.json();
  try {
    await page.goto("/en/admin/settings/workflows");
    await page
      .getByRole("combobox", { name: "Builder assistant", exact: true })
      .click();
    const option = page.getByRole("option", { name: new RegExp(name) });
    await expect(option).toBeEnabled();
    await option.click();
    await expect(page.getByText(/Selection can be saved/)).toBeVisible();
    const section = page.locator("section").filter({
      has: page.getByRole("combobox", {
        name: "Builder assistant",
        exact: true,
      }),
    });
    await section.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("Workflow builder assistant saved", { exact: true }),
    ).toBeVisible();
    expect(
      (await (await page.request.get(endpoint)).json()).config.agentId,
    ).toBe(agent.id);
  } finally {
    await page.request.patch(endpoint, { data: previous.config });
    await page.request.delete(
      `/api/workspace/agents/${agent.id}?workspaceId=${workspace.id}`,
    );
  }
});
