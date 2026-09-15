import { chromium } from "@playwright/test";

const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-sentinel-vault";
const BASE = "https://leanzero-demo.atlassian.net";
const APP_UUID = "c30bf71e-4287-4872-954d-db49cc68f0ff";
const ENV = "31eb89a3-9342-4489-b531-34ef0b19d722";
const OUT = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/sentinel-vault";

const CUSTOM_IFRAME_SELECTORS = [
  'iframe[data-testid="hosted-resources-iframe"]',
  'iframe[title^="Iframe "]',
  'iframe[title*="Iframe"]',
];

async function enterSurface(page, readySelector, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let sel = CUSTOM_IFRAME_SELECTORS[0];
  for (;;) {
    for (const s of CUSTOM_IFRAME_SELECTORS) {
      if ((await page.locator(s).count().catch(() => 0)) > 0) { sel = s; break; }
    }
    if ((await page.locator(sel).count().catch(() => 0)) > 0) break;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(300);
  }
  for (;;) {
    const n = await page.locator(sel).count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const box = await page.locator(sel).nth(i).boundingBox().catch(() => null);
      if (!box || box.width < 40 || box.height < 40) continue;
      const fl = page.locator(sel).nth(i).contentFrame();
      if (await fl.locator(readySelector).first().isVisible({ timeout: 500 }).catch(() => false)) return fl;
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(400);
  }
  throw new Error(`surface not ready: ${readySelector}`);
}

const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 900 } });
const page = context.pages()[0] || (await context.newPage());

try {
  for (const KEY of ["SECDOC", "FINDOCS"]) {
    const url = `${BASE}/wiki/spaces/${KEY}/apps/${APP_UUID}/${ENV}/realm-console`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const app = await enterSurface(page, ".space-admin-title", 45000);
    await app.locator(".tab-navigation .tab-button", { hasText: "Access Control" }).click();
    await page.waitForTimeout(1500);
    const cards = app.locator(".steward-card");
    const n = await cards.count().catch(() => 0);
    const names = [];
    for (let i = 0; i < n; i++) names.push((await cards.nth(i).innerText().catch(() => "")).replace(/\s+/g, " ").trim());
    console.log(`### ${KEY} stewards (${n}):`, JSON.stringify(names));
    await page.screenshot({ path: `${OUT}/01-${KEY.toLowerCase()}-access-control.png`, fullPage: true });
  }
} finally {
  await context.close();
}
