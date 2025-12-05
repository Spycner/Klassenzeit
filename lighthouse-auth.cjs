/**
 * Lighthouse CI authentication script
 * Logs in via Keycloak before running Lighthouse audits
 */
module.exports = async (browser, context) => {
  const page = await browser.newPage();

  // Go to app
  await page.goto("http://localhost:5173/");

  // Wait for page to fully load and button to be ready
  await page.waitForSelector("button", { visible: true });

  // Find the login button
  const loginButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find(
      (btn) =>
        btn.textContent.includes("Log in") ||
        btn.textContent.includes("Anmelden")
    );
  });

  if (!loginButton) {
    throw new Error("Login button not found");
  }

  // Click and wait for navigation to Keycloak
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }),
    loginButton.click(),
  ]);

  // Verify we're on Keycloak (URL contains /realms/)
  const currentUrl = page.url();
  if (!currentUrl.includes("/realms/")) {
    throw new Error(`Expected Keycloak URL but got: ${currentUrl}`);
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
