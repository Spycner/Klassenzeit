import { expect, test } from "../fixtures/test";
import { URLS } from "../support/urls";

test("authenticated landing page renders the dashboard", async ({ page }) => {
  await page.goto(URLS.dashboard);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
