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
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const frame = await enterForgeSurface(page);
  await page.waitForTimeout(2500);

  for (const planName of ["ATLAS Portfolio Plan", "HELIOS Research Plan"]) {
    console.log(`=== ${planName}: confirming Standard (Mon-Fri) calendar ===`);
    await frame.getByText(new RegExp(planName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).first().click();
    await page.waitForTimeout(2500);
    await frame.getByRole("button", { name: /^Schedule/i }).first().click();
    await page.waitForTimeout(1500);
    const card = frame.getByText("Standard (Mon-Fri)", { exact: true }).first();
    await card.click();
    await page.waitForTimeout(1500);
    const body = await bodyText(frame);
    const active = /Standard \(Mon-Fri\)[\s\S]{0,20}ACTIVE/i.test(body);
    console.log(`  Standard (Mon-Fri) ACTIVE after click: ${active}`);
    await page.screenshot({ path: `${SHOT_DIR}/${planName.startsWith("ATLAS") ? "52-atlas" : "53-helios"}-schedule-confirmed.png` });
    // back to portfolio
    await frame.getByRole("button", { name: /Plans|Back to plans|←/i }).first().click().catch(async () => {
      await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    });
    await page.waitForTimeout(1500);
  }
} finally {
  await context.close();
}
