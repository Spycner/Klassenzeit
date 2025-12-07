import { expect, test } from "@playwright/test";

test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("has correct title", async ({ page }) => {
    await expect(page).toHaveTitle(/klassenzeit/i);
  });

  test("displays the main heading", async ({ page }) => {
    const heading = page.getByRole("heading", { name: /klassenzeit/i });
    await expect(heading).toBeVisible();
  });

  test("displays the tagline", async ({ page }) => {
    // Matches both German "Stundenplaner für Schulen" and English "Timetabler for schools"
    const tagline = page.getByText(
      /timetabler for schools|stundenplaner für schulen/i,
    );
    await expect(tagline).toBeVisible();
  });

  test("displays the login button", async ({ page }) => {
    // Matches both German "Anmelden" and English "Log in"
    const button = page.getByRole("button", { name: /log in|anmelden/i });
    await expect(button).toBeVisible();
  });
});
