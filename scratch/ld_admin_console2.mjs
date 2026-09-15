import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-cognirunner";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://admin.atlassian.com", { waitUntil: "load", timeout: 20000 }).catch(e => console.log("ERR:", e.message));
await page.waitForTimeout(3000);
const bodyText = await page.evaluate(() => document.body.innerText).catch(()=>"");
console.log(bodyText);
await context.close();
