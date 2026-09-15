import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-cognirunner";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://admin.atlassian.com", { waitUntil: "load", timeout: 20000 }).catch(e => console.log("ERR:", e.message));
await page.waitForTimeout(2000);
// click "Select" next to wolfaenpak (first Select button)
const selectBtns = page.locator('button:has-text("Select"), a:has-text("Select")');
const count = await selectBtns.count();
console.log("select buttons found:", count);
if (count > 0) {
  await selectBtns.first().click();
  await page.waitForTimeout(3000);
}
console.log("URL after select:", page.url());
const bodyText = await page.evaluate(() => document.body.innerText).catch(()=>"");
console.log(bodyText.slice(0, 2500));
await page.screenshot({ path: "scratch/admin-console-wolfaenpak.png", fullPage: true }).catch(()=>{});
await context.close();
