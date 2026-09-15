// Recon: confirm the profile-lz-ppm persistent Chrome profile is authenticated on
// leanzero-demo.atlassian.net and see the current state of LeanZero Management's global page.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";

const context = await chromium.launchPersistentContext(PROFILE_PATH, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});

try {
  const page = context.pages()[0] || (await context.newPage());
  console.log("Navigating to", APP_URL);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2000);
  console.log("URL after nav:", page.url());

  // Check for login redirect
  if (/id\.atlassian\.com|login/i.test(page.url())) {
    console.log("!!! REDIRECTED TO LOGIN - session not authenticated for leanzero-demo");
    await page.screenshot({ path: `${SHOT_DIR}/00-recon-login-redirect.png`, fullPage: true });
  } else {
    console.log("Not redirected to login - looks authenticated");
  }

  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first()
    .waitFor({ state: "attached", timeout: 30000 }).catch((e) => console.log("iframe wait failed:", e.message));

  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT_DIR}/00-recon-global-page.png`, fullPage: true });
  console.log("Screenshot saved.");

  // Dump frame info
  const iframes = await page.locator("iframe").evaluateAll((els) =>
    els.map((e) => ({ src: e.src, testid: e.getAttribute("data-testid"), title: e.getAttribute("title") })));
  console.log("IFRAMES:", JSON.stringify(iframes, null, 2));

  const bodyTxt = await page.locator("body").innerText().catch(() => "");
  console.log("TOP PAGE BODY (first 500 chars):", bodyTxt.slice(0, 500));
} finally {
  await context.close();
}
