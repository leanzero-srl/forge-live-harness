import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://leanzero-demo.atlassian.net/jira/your-work", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
console.log("Waiting for you to complete login (email/password/MFA) in the opened window...");
const LOGIN_URL_RE = /id\.atlassian\.com|\/login(\?|$)|\/login\//;
try {
  await page.waitForFunction(
    (reSource) => !new RegExp(reSource).test(location.href),
    LOGIN_URL_RE.source,
    { timeout: 10 * 60_000 }
  );
  await page.waitForTimeout(2000);
  console.log("LOGIN_SUCCESS url=" + page.url());
} catch (e) {
  console.log("LOGIN_TIMEOUT current_url=" + page.url());
}
await context.close();
