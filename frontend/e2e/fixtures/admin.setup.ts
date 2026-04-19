import { test as setup } from "@playwright/test";
import { URLS } from "../support/urls";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "test-password-12345";
const STORAGE_STATE = ".auth/admin.json";

setup("authenticate as admin", async ({ page }) => {
  await page.goto(URLS.login);
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  // Wait for the dashboard to render; the welcome copy comes from the English
  // i18n catalog and is unique to the authenticated landing page.
  await page.getByRole("heading", { name: "Dashboard" }).waitFor({ state: "visible" });

  await page.context().storageState({ path: STORAGE_STATE });
});
