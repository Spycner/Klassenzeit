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
    const tagline = page.getByText(/timetabler for schools/i);
    await expect(tagline).toBeVisible();
  });

  test("displays the get started button", async ({ page }) => {
    const button = page.getByRole("button", { name: /get started/i });
    await expect(button).toBeVisible();
  });

  test("get started button is clickable", async ({ page }) => {
    const button = page.getByRole("button", { name: /get started/i });
    await expect(button).toBeEnabled();
  });
});
