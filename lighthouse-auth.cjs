/**
 * Lighthouse CI authentication script
 * Logs in via Keycloak before running Lighthouse audits
 */
module.exports = async (browser, context) => {
  const page = await browser.newPage();

  // Go to app
  await page.goto("http://localhost:5173/");

  // Wait for page to load
  await page.waitForSelector("button", { visible: true });

  // Check if we're already logged in (redirected to dashboard)
  const currentUrl = page.url();
  if (currentUrl.includes("/dashboard")) {
    // Already authenticated, no need to log in again
    await page.close();
    return;
  }

  // Find the login button
  const loginButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find(
      (btn) =>
        btn.textContent.includes("Log in") ||
        btn.textContent.includes("Anmelden")
    );
  });

  // If no login button found, we might already be authenticated
  if (!loginButton || (await loginButton.jsonValue()) === null) {
    await page.close();
    return;
  }

  // Click and wait for navigation to Keycloak
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }),
    loginButton.click(),
  ]);

  // Verify we're on Keycloak (URL contains /realms/)
  const keycloakUrl = page.url();
  if (!keycloakUrl.includes("/realms/")) {
    // Not on Keycloak - might already be authenticated
    await page.close();
    return;
  }

  // Wait for Keycloak login form
  await page.waitForSelector("#username", { timeout: 30000 });

  // Fill credentials
  await page.type("#username", "e2e-test@klassenzeit.com");
  await page.type("#password", "e2e-test-password");
  await page.click("#kc-login");

  // Wait for redirect back to app
  await page.waitForNavigation({ waitUntil: "networkidle0" });

  await page.close();
};
