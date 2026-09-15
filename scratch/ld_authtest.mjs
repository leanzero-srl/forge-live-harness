import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://leanzero-demo.atlassian.net/jira/your-work", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => console.log("GOTO ERROR:", e.message));
await page.waitForTimeout(3000);
console.log("FINAL URL:", page.url());
console.log("TITLE:", await page.title());
const isLoginPage = /id\.atlassian\.com|\/login/.test(page.url());
console.log("LOOKS LIKE LOGIN PAGE:", isLoginPage);
await page.screenshot({ path: "/tmp/ld_authtest.png", fullPage: false }).catch(e=>console.log("screenshot fail", e.message));
await context.close();
