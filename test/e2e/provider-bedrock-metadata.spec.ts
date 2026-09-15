import { expect, test } from "@playwright/test";
import { ensureE2EUser, ensureE2EAssistant, login } from "./fixtures";
test.beforeAll(ensureE2EUser);
test.beforeEach(async ({ page }) => login(page));
test("Bedrock setup, model metadata, pricing, images and copyable errors", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const assistant = await ensureE2EAssistant();
  const workspaceId = assistant.workspaceId;
  const switched = await page.request.patch("/api/workspaces", {
    data: { workspaceId },
  });
  expect(switched.ok()).toBeTruthy();
  let providerId: string | undefined;
  await page.route(
    (url) =>
      url.pathname.includes("/providers/") &&
      url.searchParams.get("action") === "discover",
    (route) =>
      route.fulfill({
        json: [
          {
            modelId: "amazon.nova-canvas-v1:0",
            displayName: "Nova Canvas",
            capabilities: { imageGeneration: true },
            sustainability: { currency: "USD", energyKwhPerMillionTokens: 0 },
            inputTokenCost: "0.50",
          },
        ],
      }),
  );
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/providers");
    await page
      .getByRole("button", { name: /Connect AI|Add connection/i })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Amazon Bedrock", exact: true })
      .click();
    await expect(page.locator("#add-provider-url")).toHaveCount(0);
    await page.locator("#add-provider-name").fill(`Bedrock E2E ${Date.now()}`);
    await page.locator("#add-provider-key").fill("test-bedrock-api-key");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: "output/playwright/bedrock-setup-mobile.png",
    });
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/workspace/providers") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Connect", exact: true })
      .click();
    const response = await created;
    expect(response.status()).toBe(201);
    const safe = await response.json();
    providerId = safe.id;
    expect(JSON.stringify(safe)).not.toContain("test-bedrock-api-key");
    expect(safe.bedrockConfig).toEqual({
      region: "eu-west-1",
      authMode: "api-key",
    });
    await expect(
      page.getByText("Discovered (1)", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Select Nova Canvas", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add selected (1)", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Configure model", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Configure model", exact: true })
      .click();
    await page
      .locator("#model-description")
      .fill("Create illustrations for your team");
    await page.locator("#model-tags").fill("Images, Creative");
    await expect(page.locator("#model-currency")).toHaveValue("USD");
    await expect(
      page.getByLabel("Keep my prices and metrics during synchronization"),
    ).not.toBeChecked();
    await page.locator("#model-inputTokenCost").fill("1.25");
    await expect(
      page.getByLabel("Keep my prices and metrics during synchronization"),
    ).toBeChecked();
    await page.screenshot({
      path: "output/playwright/model-metadata-mobile.png",
    });
    await page.getByRole("button", { name: "Save model", exact: true }).click();
    await page
      .getByText("Create illustrations for your team", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText("Create illustrations for your team", { exact: true }),
    ).toBeVisible();
    const models = await (
      await page.request.get(
        `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
      )
    ).json();
    expect(models[0]).toMatchObject({
      description: "Create illustrations for your team",
      tags: ["Images", "Creative"],
      inputTokenCost: "1.25",
      sustainabilityConfigJson: {
        manualOverride: true,
        currency: "USD",
        energyKwhPerMillionTokens: 0,
      },
    });
    await page.route(
      (url) =>
        url.pathname.includes("/providers/") &&
        url.searchParams.get("action") === "discover",
      (route) =>
        route.fulfill({
          status: 403,
          json: { error: "BEDROCK_ACCESS_DENIED" },
          headers: { "x-request-id": "bedrock-e2e-request" },
        }),
    );
    await page
      .getByRole("button", { name: "Discover models", exact: true })
      .click();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Error details" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Error report" }),
    ).toContainText("BEDROCK_ACCESS_DENIED");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
      .getByRole("button", { name: "Copy details", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "bedrock-e2e-request",
    );
    await page
      .getByRole("dialog", { name: "Error details" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/en/agents/${assistant.agentId}`);
    await page.getByRole("combobox", { name: "Provider", exact: true }).click();
    await page.getByRole("option", { name: safe.name, exact: true }).click();
    await page.getByRole("combobox", { name: "Model", exact: true }).click();
    const choice = page.getByRole("option", {
      name: "Nova Canvas",
      exact: true,
    });
    await expect(choice).toContainText("Create illustrations for your team");
    await expect(choice).toContainText("Creative");
    await expect(choice).toContainText(safe.name);
    await page.keyboard.press("Escape");
  } finally {
    if (providerId)
      await page.request.delete(
        `/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
      );
  }
});
