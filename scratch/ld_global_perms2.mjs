import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://leanzero-demo.atlassian.net/jira/settings/system/access-management", { waitUntil: "load", timeout: 20000 }).catch(e => console.log("ERR:", e.message));
await page.waitForTimeout(1500);
const link = page.locator('a:has-text("Global permissions")').first();
const href = await link.getAttribute('href').catch(()=>null);
console.log("Global permissions href:", href);
if (href) {
  await page.goto("https://leanzero-demo.atlassian.net" + href, { waitUntil: "load", timeout: 20000 }).catch(e => console.log("ERR:", e.message));
  await page.waitForTimeout(2500);
  console.log("landed:", page.url());
  const bodyText = await page.evaluate(() => document.body.innerText).catch(()=>"");
  console.log(bodyText.slice(0, 3000));
  await page.screenshot({ path: "scratch/global-perms-real.png", fullPage: true }).catch(()=>{});
}
await context.close();
