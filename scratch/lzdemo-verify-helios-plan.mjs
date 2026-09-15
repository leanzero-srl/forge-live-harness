import { chromium } from "@playwright/test";
const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";

async function bodyText(frame) { return (await frame.locator("body").innerText().catch(() => "")) || ""; }
async function enterForgeSurface(page, timeout = 30000) {
  await page.evaluate(() => document.querySelectorAll("#aui-flag-container").forEach(e=>e.remove())).catch(()=>{});
  const sel = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]';
  await page.locator(sel).first().waitFor({ state: "attached", timeout });
  return page.locator(sel).first().contentFrame();
}

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1600, height: 1000 } });
try {
  const page = context.pages()[0] || (await context.newPage());
  console.log("=== FRESH navigation ===");
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const frame = await enterForgeSurface(page);
  await page.waitForTimeout(2500);

  await frame.getByText(/HELIOS Research Plan/i).first().click();
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);

  let bars = 0;
  for (let i = 0; i < 25; i++) {
    bars = await frame.locator('[data-testid="gantt-bar"]').count().catch(() => 0);
    if (bars > 0) break;
    await page.waitForTimeout(2000);
  }
  const conn = await frame.locator('[data-testid="dep-arrow-hit"]').count().catch(() => 0);
  const body = await bodyText(frame);
  const showing = (body.match(/Showing\s+[\d,]+\s+of\s+[\d,]+/i) || [])[0] || "none";
  console.log("BARS:", bars, "CONNECTORS:", conn, "SHOWING:", showing);
  await page.screenshot({ path: `${SHOT_DIR}/45-helios-gantt-fresh-reload.png` });

  // zoom to month to widen view over the connector
  await frame.getByRole("button", { name: /Month/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT_DIR}/46-helios-gantt-month-zoom.png` });
  const conn2 = await frame.locator('[data-testid="dep-arrow-hit"]').count().catch(() => 0);
  console.log("CONNECTORS AFTER MONTH ZOOM:", conn2);
} finally {
  await context.close();
}
