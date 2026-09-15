import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-cognirunner";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();

for (const url of [
  "https://leanzero-demo.atlassian.net/jira/settings/access",
  "https://leanzero-demo.atlassian.net/jira/settings/products/jira-software/access",
  "https://admin.atlassian.com",
]) {
  await page.goto(url, { waitUntil: "load", timeout: 20000 }).catch(e => console.log(url, "ERR:", e.message));
  await page.waitForTimeout(2500);
  console.log("---");
  console.log("requested:", url);
  console.log("landed:", page.url());
  console.log("title:", await page.title());
}
await page.screenshot({ path: "scratch/anon-settings-2.png", fullPage: true }).catch(()=>{});
await context.close();
