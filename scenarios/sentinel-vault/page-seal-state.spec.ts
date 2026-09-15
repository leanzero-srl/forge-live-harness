// DEEP page journey: the DEV Sentinel Vault doc-ribbon (pageBanner) must correctly report the
// page's sealed attachment. GOTCHA: wolfaenpak has BOTH the dev (env 17516615) AND prod (env
// 31eb89a3) installs active, so TWO banners render — each reading its OWN storage. We MUST
// target the dev banner by env id, else the prod install (no dev seal → "none sealed") confounds.
// The fixture attachment (page 265912321) is sealed via the dev install, so the dev banner must
// say "sealed", not "none sealed" — a regression guard for the doc-ribbon's seal detection.
// @covers resolver:enumerate-doc-artifacts manifest:confluence:pageBanner:sentinel-vault-ribbon
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV_ENV = "17516615"; // Sentinel Vault development env id (config/targets.ts SENTINEL_ENV)
import { findDevChip } from "./_door";
const OUT = "/tmp/sv-pageseal";
test.describe.configure({ retries: 1 });
test("the dev byline chip reports the sealed attachment (env-scoped, ignores the prod install)", async ({ page }) => {
  // Since 7.0 the ribbon closes when nothing is urgent for the viewer (owner-held seal, nothing
  // waiting); the ALWAYS-present state indicator is the byline chip, whose icon carries a lock
  // whenever the page holds a live seal. That is what this spec now asserts.
  mkdirSync(OUT, { recursive: true });
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  const chip = await findDevChip(page);
  await page.screenshot({ path: `${OUT}/settled.png` });
  const icon = chip.locator('img[data-testid="byline-forge-app-image"]');
  await expect(icon, "the dev chip renders its icon from the sentinel-byline property").toBeVisible({ timeout: 30000 });
  const src = (await icon.getAttribute("src")) || "";
  console.log("### dev chip:", JSON.stringify(await chip.innerText()), "icon lock:", /lock/i.test(src) || /M8 11V7|rect/i.test(decodeURIComponent(src)));
  expect(/lock|M8 11V7|rect/i.test(decodeURIComponent(src)), "the chip icon is the LOCK variant (a live seal on this page)").toBeTruthy();
});
