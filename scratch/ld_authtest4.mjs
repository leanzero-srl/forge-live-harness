import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://leanzero-demo.atlassian.net/jira/your-work", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => console.log("GOTO ERROR:", e.message));
await page.waitForTimeout(2000);
console.log("URL before click:", page.url());

// Click "Continue" button
const continueBtn = page.getByRole('button', { name: /continue/i }).first();
const visible = await continueBtn.isVisible({timeout: 5000}).catch(()=>false);
console.log("Continue button visible:", visible);
if (visible) {
  await continueBtn.click();
  await page.waitForTimeout(4000);
}
console.log("URL after click:", page.url());
console.log("TITLE:", await page.title());
await page.screenshot({ path: "scratch/ld_after_continue.png", fullPage: true }).catch(e=>console.log("shot fail", e.message));
const bodyText = await page.evaluate(() => document.body.innerText).catch(()=>"");
console.log("BODY TEXT (first 1200 chars):\n", bodyText.slice(0, 1200));
await context.close();
