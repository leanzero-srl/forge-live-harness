import { chromium } from "@playwright/test";
const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const ADMIN_URL = "https://leanzero-demo.atlassian.net/jira/settings/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092/ppm-admin-settings";
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
  console.log("=== Navigating to admin settings ===");
  await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  console.log("URL:", page.url());
  const frame = await enterForgeSurface(page, 20000).catch((e) => { console.log("iframe wait err:", e.message); return null; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT_DIR}/50-admin-settings-landing.png` });
  if (frame) {
    const body = await bodyText(frame);
    console.log("ADMIN BODY (first 1200):", body.slice(0, 1200));
  } else {
    const topBody = await page.locator("body").innerText().catch(() => "");
    console.log("TOP PAGE BODY (first 800):", topBody.slice(0, 800));
  }
} finally {
  await context.close();
}
