import { expect, test } from "@playwright/test";

test.describe("Navigation", () => {
  test("home page loads successfully", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("page has main heading", async ({ page }) => {
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
  });

  test("page is responsive", async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const heading = page.getByRole("heading", { name: /klassenzeit/i });
    await expect(heading).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(heading).toBeVisible();
  });
});
