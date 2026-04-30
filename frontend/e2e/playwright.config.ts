import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const STORAGE_STATE = path.join(import.meta.dirname, ".auth", "admin.json");

const BACKEND_URL = "http://localhost:8000";
const FRONTEND_URL = "http://localhost:4173";
const DATABASE_URL =
  process.env.KZ_E2E_DATABASE_URL ??
  "postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test";

export default defineConfig({
  testDir: "./flows",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: FRONTEND_URL,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "admin-setup",
      testDir: "./fixtures",
      testMatch: /admin\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["admin-setup"],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],
  webServer: [
    {
      command: "uv --project ../../backend run uvicorn klassenzeit_backend.main:app --port 8000",
      url: `${BACKEND_URL}/__test__/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        KZ_ENV: "test",
        KZ_DATABASE_URL: DATABASE_URL,
        KZ_COOKIE_SECURE: "false",
      },
    },
    {
      command: "pnpm -C .. exec vite preview --port 4173 --strictPort",
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
