import { expect, test } from "../fixtures/test";
import { URLS } from "../support/urls";

test.describe("Subjects CRUD", () => {
  test("creates, edits, and deletes a subject", async ({ page }) => {
    // Navigate to the dashboard first so the SPA bootstraps, then click the
    // Subjects nav link. Direct goto("/subjects") hits the Vite proxy which
    // forwards that path to the backend API instead of the SPA.
    await page.goto(URLS.dashboard);
    // The dashboard also has a "New Subjects" quick-add card that partially
    // matches "Subjects", so scope the sidebar click with exact: true.
    await page.getByRole("link", { name: "Subjects", exact: true }).click();

    // Create. When the list is empty the PageHead and EmptyState both render a
    // "New subject" button, so pick the first (header) one explicitly.
    await page.getByRole("button", { name: "New subject" }).first().click();
    await page.getByLabel("Name", { exact: true }).fill("Physics");
    await page.getByLabel("Short name").fill("PH");
    await page.getByRole("button", { name: "Create" }).click();

    const physicsRow = page.getByRole("row", { name: /Physics/ });
    await expect(physicsRow).toBeVisible();

    // Edit
    await physicsRow.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Short name", { exact: true }).fill("PHY");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("cell", { name: "PHY", exact: true })).toBeVisible();

    // Delete
    await physicsRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect(
      page.getByRole("heading", { name: /start with your subject catalogue/i }),
    ).toBeVisible();
  });
});
