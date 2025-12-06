import { expect, test as setup } from "@playwright/test";
import path from "node:path";

const authFile = path.join(import.meta.dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  // Navigate to app
  await page.goto("/");

  // Click login button (supports both English and German)
  await page.getByRole("button", { name: /log in|anmelden/i }).click();

  // Wait for Keycloak login page and fill credentials
  await page.waitForSelector("#username", { timeout: 10000 });
  await page.fill("#username", "e2e-test@klassenzeit.com");
  await page.fill("#password", "e2e-test-password");
  await page.click("#kc-login");

  // Wait for redirect back to app (dashboard)
  await page.waitForURL(/\/(de|en)\/dashboard/, { timeout: 15000 });

  // Verify logged in by checking for dashboard content
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Save auth state for reuse in other tests
  await page.context().storageState({ path: authFile });
});
