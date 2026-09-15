import { chromium } from "@playwright/test";

const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-sentinel-vault";
const BASE = "https://leanzero-demo.atlassian.net";
const OUT = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/sentinel-vault";
const PAGE_ID = "851969"; // Information Security Policy (SECDOC)

const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 900 } });
const page = context.pages()[0] || (await context.newPage());
try {
  await page.goto(`${BASE}/wiki/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/13-page-fullpage.png`, fullPage: true });

  const chips = page.locator('button[data-testid="byline-forge-app-button"]');
  const n = await chips.count().catch(() => 0);
  console.log("### byline forge-app buttons found:", n);
  for (let i = 0; i < n; i++) {
    console.log(`  #${i}:`, JSON.stringify((await chips.nth(i).innerText().catch(() => "")).trim()));
  }

  // dump the byline/metadata area text broadly
  const bylineArea = await page.locator("body").innerText().catch(() => "");
  console.log("### page body length:", bylineArea.length);

  // check iframes present on page (any Forge apps rendering here at all)
  const ifr = page.locator("iframe");
  const m = await ifr.count().catch(() => 0);
  console.log("### total iframes on page:", m);
  for (let i = 0; i < m; i++) {
    const src = await ifr.nth(i).getAttribute("src").catch(() => "");
    const title = await ifr.nth(i).getAttribute("title").catch(() => "");
    console.log(`  iframe#${i} title=${JSON.stringify(title)} src=${(src||"").slice(0,120)}`);
  }
} finally {
  await context.close();
}
