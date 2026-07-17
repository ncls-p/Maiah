import { expect, test } from "@playwright/test";

test.describe("OpenAPI documentation", () => {
  test("publishes the complete contract and interactive Swagger UI", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.request.get("/api/openapi");
    expect(response.ok()).toBeTruthy();
    const document = (await response.json()) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
      components: { securitySchemes: Record<string, unknown> };
    };

    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths).length).toBeGreaterThan(90);
    expect(document.paths["/api/workspace/api-keys"].post).toBeTruthy();
    expect(document.paths["/api/v1/models"].get).toBeTruthy();
    expect(document.paths["/api/v1/chat/completions"].post).toBeTruthy();
    expect(document.paths["/v1/models"]).toBeUndefined();
    expect(document.components.securitySchemes.workspaceBearer).toBeTruthy();

    const legacyResponse = await page.request.get("/api-docs", {
      maxRedirects: 0,
    });
    expect(legacyResponse.status()).toBe(308);
    expect(legacyResponse.headers().location).toBe("/api/docs");

    await page.goto("/api/docs");
    await expect(page.getByRole("heading", { name: "Maiah API" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("#swagger-ui")).toHaveAttribute(
      "data-ready",
      "true",
    );
    await expect(page.getByText("Authorize").first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
