import { chromium } from "@playwright/test";
const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1600, height: 1000 } });
try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll("#aui-flag-container").forEach(e=>e.remove()));
  const frame = page.locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(/HELIOS Research Plan/i).first().click();
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Table/i }).first().click();
  await page.waitForTimeout(2000);

  const r = frame.locator('[data-testid="table-row"][data-row-key="HELIOS-19"]');
  await r.scrollIntoViewIfNeeded().catch(() => {});
  console.log("current start/due:", await r.getAttribute("data-row-start"), await r.getAttribute("data-row-due"));
  const dueCell = r.locator(':scope > div').nth(4);
  await dueCell.click();
  await page.waitForTimeout(500);
  const calCount = await frame.locator('.lz-datepicker').count();
  console.log("cal count:", calCount);
  const cal = frame.locator('.lz-datepicker').last();
  for (let i=0;i<5;i++){
    const title = await cal.locator('span').first().textContent();
    console.log(`iter ${i}: title="${title}"`);
    await cal.locator('button').nth(1).click();
    await page.waitForTimeout(300);
  }
} finally {
  await context.close();
}
