import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://leanzero-demo.atlassian.net/jira/your-work", { waitUntil: "load", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000); // let the redirect chain fully settle before we start checking
console.log("Settled at:", page.url());
console.log("Waiting for you to complete login (email/password/MFA) in the opened window (up to 10 min)...");

const JIRA_READY = '[data-testid="atlassian-navigation--secondary-actions"], [aria-label="Your profile and settings"], #jira-frontend, [data-testid="ak-jira-navigation"]';
const deadline = Date.now() + 10 * 60_000;
let confirmed = false;
while (Date.now() < deadline) {
  await page.waitForTimeout(3000);
  const url = page.url();
  const onLogin = /id\.atlassian\.com|\/login(\?|$)|\/login\//.test(url);
  if (!onLogin) {
    // require the ready-selector to actually be visible, not just a URL change
    const ready = await page.locator(JIRA_READY).first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`url=${url} onLogin=${onLogin} jiraReady=${ready}`);
    if (ready) { confirmed = true; break; }
  } else {
    console.log(`still on login: ${url}`);
  }
}
if (confirmed) {
  console.log("LOGIN_CONFIRMED url=" + page.url());
} else {
  console.log("LOGIN_TIMEOUT_OR_UNCONFIRMED url=" + page.url());
}
await context.close();
