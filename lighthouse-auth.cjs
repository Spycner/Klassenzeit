/**
 * Lighthouse CI authentication script
 * Logs in via Keycloak before running Lighthouse audits
 */
module.exports = async (browser, context) => {
  const page = await browser.newPage();

  // Go to app
  await page.goto("http://localhost:5173/");

  // Wait for page to load
  await page.waitForSelector("button");

  // Click login button using XPath (supports both English and German)
  const [loginButton] = await page.$x(
    '//button[contains(text(), "Log in") or contains(text(), "Anmelden")]'
  );
  if (loginButton) {
    await loginButton.click();
  } else {
    throw new Error("Login button not found");
  }

  // Wait for Keycloak login page
  await page.waitForSelector("#username", { timeout: 10000 });

  // Fill credentials
  await page.type("#username", "e2e-test@klassenzeit.com");
  await page.type("#password", "e2e-test-password");
  await page.click("#kc-login");

  // Wait for redirect back to app
  await page.waitForNavigation({ waitUntil: "networkidle0" });

  await page.close();
};
