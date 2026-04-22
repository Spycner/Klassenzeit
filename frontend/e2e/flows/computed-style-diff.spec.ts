import { expect, test } from "../fixtures/test";
import { collectStyleDrift, type Finding, ROUTES_UNDER_TEST } from "../support/style-diff";

// The crawl visits nine routes and for each interactive signature captures
// four states with locator-level auto-waiting. Budget generously so the assert
// always runs and drift.json attaches, rather than timing out mid-collection.
test.setTimeout(5 * 60 * 1000);

test("no structural style drift across interaction states", async ({ page }, testInfo) => {
  const findings: Finding[] = [];
  for (const route of ROUTES_UNDER_TEST) {
    findings.push(...(await collectStyleDrift(page, route, testInfo)));
  }

  await testInfo.attach("drift.json", {
    body: Buffer.from(JSON.stringify(findings, null, 2), "utf8"),
    contentType: "application/json",
  });

  expect(findings, describeFindings(findings)).toEqual([]);
});

function describeFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return "no drift";
  const byRoute = new Map<string, number>();
  for (const f of findings) byRoute.set(f.route, (byRoute.get(f.route) ?? 0) + 1);
  const summary = Array.from(byRoute.entries())
    .map(([route, count]) => `${route}=${count}`)
    .join(", ");
  return `${findings.length} structural drift findings (${summary}); see drift.json attachment`;
}
