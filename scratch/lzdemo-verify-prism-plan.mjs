// Verifies the PRISM Data Platform Plan on leanzero-demo: FRESH navigation (not the wizard's own
// success screen), open the plan from the portfolio list, confirm the Gantt renders real bars for
// real PRISM issues, then check Table + Dashboard views too.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";

async function bodyText(frame) { return (await frame.locator("body").innerText().catch(() => "")) || ""; }
async function dismissHostFlags(page) {
  await page.evaluate(() => {
    for (const sel of ["#aui-flag-container", '[data-testid="flag-group"]', '[data-testid$=".flag-group"]', "#jira-flags"]) {
      for (const el of Array.from(document.querySelectorAll(sel))) { if (el.childElementCount) el.remove(); }
    }
  }).catch(() => {});
}
async function enterForgeSurface(page, timeout = 30000) {
  await dismissHostFlags(page);
  const sel = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]';
  await page.locator(sel).first().waitFor({ state: "attached", timeout });
  return page.locator(sel).first().contentFrame();
}

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1600, height: 1000 } });
let step = 62;
async function shot(page, name) {
  step += 1;
  const path = `${SHOT_DIR}/${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path });
  console.log("SHOT:", path);
}

try {
  const page = context.pages()[0] || (await context.newPage());
  console.log("=== FRESH navigation to portfolio list ===");
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  let frame = await enterForgeSurface(page);
  await page.waitForTimeout(2500);

  console.log("=== Opening PRISM Data Platform Plan card ===");
  await frame.getByText(/PRISM Data Platform Plan/i).first().click();
  await page.waitForTimeout(3000);
  await shot(page, "prism-plan-opened-fresh");

  console.log("=== Clicking Gantt tab explicitly ===");
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);

  let bars = 0;
  for (let i = 0; i < 30; i++) {
    bars = await frame.locator('[data-testid="gantt-bar"]').count().catch(() => 0);
    if (bars > 0) break;
    await page.waitForTimeout(2000);
  }
  console.log("GANTT BARS COUNT:", bars);
  await shot(page, "prism-gantt-real-bars");

  const headerTxt = await bodyText(frame);
  const showing = (headerTxt.match(/Showing\s+[\d,]+\s+of\s+[\d,]+/i) || [])[0] || "none";
  console.log("SHOWING:", showing);

  const connCount = await frame.locator('[data-testid="dep-arrow-hit"]').count().catch(() => 0);
  console.log("DEPENDENCY CONNECTOR COUNT:", connCount);

  const zoomBtn = frame.getByRole("button", { name: /Month/i }).first();
  if (await zoomBtn.isVisible().catch(() => false)) {
    await zoomBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, "prism-gantt-month-zoom");
  }

  console.log("=== Table view ===");
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "prism-table-view");

  console.log("=== Dashboard view ===");
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const dashBody = await bodyText(frame);
  console.log("DASHBOARD BODY (first 500):", dashBody.slice(0, 500));
  await shot(page, "prism-dashboard-view");

  console.log("PRISM_VERIFY_DONE bars=" + bars + " connectors=" + connCount + " showing=" + showing);
} catch (err) {
  console.error("SCRIPT ERROR:", err);
  process.exitCode = 1;
} finally {
  await context.close();
}
