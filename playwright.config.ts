import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  // The suite intentionally exercises shared workspace state (setup, keys, agents).
  // Run it as one deterministic user journey instead of racing mutations.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.CI
    ? undefined
    : [
        {
          command: "npm run dev",
          url: "http://localhost:3000",
          name: "app",
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: "npm run worker",
          url: "http://localhost:3001/health",
          name: "worker",
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
