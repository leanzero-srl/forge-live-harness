import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-cognirunner";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
// Jira product access / anonymous access settings live under admin.atlassian.com or the site's own admin
await page.goto("https://leanzero-demo.atlassian.net/jira/settings/products", { waitUntil: "load", timeout: 30000 }).catch(e => console.log("ERR:", e.message));
await page.waitForTimeout(3000);
console.log("URL:", page.url());
console.log("TITLE:", await page.title());
const bodyText = await page.evaluate(() => document.body.innerText).catch(()=>"");
console.log("BODY (first 2000):\n", bodyText.slice(0, 2000));
await page.screenshot({ path: "scratch/anon-settings-1.png", fullPage: true }).catch(()=>{});
await context.close();
