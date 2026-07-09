// DEEP page journey: the DEV Sentinel Vault doc-ribbon (pageBanner) must correctly report the
// page's sealed attachment. GOTCHA: wolfaenpak has BOTH the dev (env 17516615) AND prod (env
// 31eb89a3) installs active, so TWO banners render — each reading its OWN storage. We MUST
// target the dev banner by env id, else the prod install (no dev seal → "none sealed") confounds.
// The fixture attachment (page 265912321) is sealed via the dev install, so the dev banner must
// say "sealed", not "none sealed" — a regression guard for the doc-ribbon's seal detection.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV_ENV = "17516615"; // Sentinel Vault development env id (config/targets.ts SENTINEL_ENV)
const OUT = "/tmp/sv-pageseal";
test.describe.configure({ retries: 1 });
test("dev doc-ribbon reports the sealed attachment (env-scoped, ignores the prod install)", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/settled.png` });
  const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]');
  const n = await ifr.count().catch(() => 0);
  let devBanner = "";
  for (let i = 0; i < n; i++) {
    const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
    if (!src.includes(DEV_ENV)) continue;
    const txt = (await ifr.nth(i).contentFrame().locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (/on this page/i.test(txt) && /sealed/i.test(txt)) devBanner = txt.slice(0, 100);
  }
  console.log("### dev banner:", JSON.stringify(devBanner));
  expect(devBanner, "the dev doc-ribbon banner is present on the page").toBeTruthy();
  expect(/\bsealed on this page/i.test(devBanner) && !/none sealed/i.test(devBanner),
    `dev banner must reflect the dev seal (got: "${devBanner}")`).toBeTruthy();
});
