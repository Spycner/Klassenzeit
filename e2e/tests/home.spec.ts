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

  test("displays the get started link", async ({ page }) => {
    // The "Get Started" button is actually a link (Button asChild with Link)
    // Matches both German "Loslegen" and English "Get Started"
    const link = page.getByRole("link", { name: /get started|loslegen/i });
    await expect(link).toBeVisible();
  });

  test("get started link navigates to dashboard", async ({ page }) => {
    const link = page.getByRole("link", { name: /get started|loslegen/i });
    await expect(link).toHaveAttribute("href", /\/dashboard$/);
  });
});
