import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
    ...(process.env.CI ? ([["github"]] as const) : []),
  ],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  // Web server configuration for local development
  // In CI, services are started separately
  webServer: process.env.CI
    ? undefined
    : {
        command: "cd ../frontend && npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
