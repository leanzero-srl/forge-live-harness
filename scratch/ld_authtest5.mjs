import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://leanzero-demo.atlassian.net/jira/your-work", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => console.log("GOTO ERROR:", e.message));
await page.waitForTimeout(5000);
console.log("URL:", page.url());
const bodyText = await page.evaluate(() => document.body.innerText).catch(()=>"ERR");
console.log("BODY TEXT LEN:", bodyText.length);
console.log(bodyText.slice(0, 2000));
await page.screenshot({ path: "scratch/ld_state5.png", fullPage: true }).catch(e=>console.log("shot fail", e.message));
// list all buttons/links
const clickables = await page.locator('button, a[role="button"], [role="button"]').allTextContents().catch(()=>[]);
console.log("CLICKABLES:", JSON.stringify(clickables));
await context.close();
