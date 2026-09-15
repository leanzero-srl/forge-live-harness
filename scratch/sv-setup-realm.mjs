// Configure the Sentinel Vault "realm" for SECDOC and FINDOCS on leanzero-demo:
// - Space Activation -> Active (explicit, not "Use System Default")
// - Add mihai@wolfaenpak.com as an explicit named Steward
// - Apply Configuration, screenshot, reload and re-verify persisted.
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
    for (const s of CUSTOM_IFRAME_SELECTORS) if ((await page.locator(s).count().catch(() => 0)) > 0) { sel = s; break; }
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

async function ensureInViewport(page, target, maxSteps = 12) {
  const vp = page.viewportSize() || { width: 1440, height: 900 };
  for (let i = 0; i < maxSteps; i++) {
    const box = await target.boundingBox().catch(() => null);
    if (!box) { await page.waitForTimeout(300); continue; }
    if (box.y >= 0 && box.y + box.height <= vp.height) return;
    const delta = box.y + box.height > vp.height ? Math.min(box.y + box.height - vp.height + 120, 1200) : Math.max(box.y - 120, -1200);
    await page.mouse.move(Math.floor(vp.width / 2), Math.floor(vp.height / 2));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(250);
  }
}

async function openAccessControl(page, KEY) {
  const url = `${BASE}/wiki/spaces/${KEY}/apps/${APP_UUID}/${ENV}/realm-console`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const app = await enterSurface(page, ".space-admin-title", 45000);
  await app.locator(".tab-navigation .tab-button", { hasText: "Access Control" }).click();
  await page.waitForTimeout(1200);
  return app;
}

async function setupRealm(page, KEY) {
  console.log(`\n=== ${KEY} ===`);
  let app = await openAccessControl(page, KEY);

  // 1) Space Activation dropdown -> Active
  const select = app.locator(".custom-select").first();
  await ensureInViewport(page, select);
  await select.click();
  await page.waitForTimeout(400);
  const activeOpt = app.locator(".select-option", { has: app.locator(".option-label", { hasText: /^Active$/ }) });
  await activeOpt.waitFor({ state: "visible", timeout: 8000 });
  await activeOpt.click();
  await page.waitForTimeout(400);
  const selVal = (await app.locator(".select-value").innerText().catch(() => "")).trim();
  console.log(`### ${KEY} activation now shows:`, selVal);
  await page.screenshot({ path: `${OUT}/03-${KEY.toLowerCase()}-activation-set.png`, fullPage: true });

  // 2) Add steward
  const addCard = app.locator(".steward-card-add");
  await ensureInViewport(page, addCard);
  await addCard.click();
  const input = app.locator('input[placeholder="Type to search for users..."]');
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.click();
  await input.fill("mihai");
  await page.waitForTimeout(3000);
  const result = app.getByText("Mihai Perdum", { exact: true }).first();
  await result.waitFor({ state: "visible", timeout: 10000 });
  await result.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/04-${KEY.toLowerCase()}-steward-added.png`, fullPage: true });

  // 3) Apply Configuration
  const apply = app.locator(".action-bar .btn-primary", { hasText: "Apply Configuration" });
  await ensureInViewport(page, apply);
  await apply.click();
  await page.waitForTimeout(2500);
  const bodyTxt = (await app.locator("body").innerText().catch(() => "")).slice(0, 600);
  console.log(`### ${KEY} after Apply, body snippet:`, JSON.stringify(bodyTxt));
  await page.screenshot({ path: `${OUT}/05-${KEY.toLowerCase()}-applied.png`, fullPage: true });

  // 4) reload + re-verify
  app = await openAccessControl(page, KEY);
  const cards = app.locator(".steward-card");
  const n = await cards.count().catch(() => 0);
  const names = [];
  for (let i = 0; i < n; i++) names.push((await cards.nth(i).innerText().catch(() => "")).replace(/\s+/g, " ").trim());
  const selValAfter = (await app.locator(".select-value").innerText().catch(() => "")).trim();
  console.log(`### ${KEY} AFTER RELOAD — activation: "${selValAfter}", stewards (${n}):`, JSON.stringify(names));
  await page.screenshot({ path: `${OUT}/06-${KEY.toLowerCase()}-reload-verify.png`, fullPage: true });
}

const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 900 } });
const page = context.pages()[0] || (await context.newPage());
try {
  await setupRealm(page, "SECDOC");
  await setupRealm(page, "FINDOCS");
} finally {
  await context.close();
}
