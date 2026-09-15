// Mints a Rules REST API token (Listeners & Scheduled Jobs) via CogniRunner's admin panel
// Settings tab on leanzero-demo.atlassian.net, using the pre-authenticated persistent Chrome
// profile at PROFILE_PATH. Writes { url, token } to a LOCAL, gitignored scratchpad file --
// never printed to stdout/logs (same discipline as CogniRunner's own test-harness scripts:
// "NOTHING SECRET IS PRINTED").
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const PROFILE_PATH =
  "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-cognirunner";
const DEEP_LINK =
  "https://leanzero-demo.atlassian.net/jira/apps/36415848-6868-4697-9554-3c3ad87b8da9/37dd35f1-42db-4e65-8e91-b2f18caed58d";
const EVIDENCE_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/cognirunner";
const OUT_FILE =
  "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/rules-api-token.json";

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let shot = 17; // continue evidence numbering (17 already used)
function shotPath(name) {
  shot += 1;
  return path.join(EVIDENCE_DIR, `${String(shot).padStart(2, "0")}-${name}.png`);
}

async function enterAdminFrame(page) {
  const sel = 'iframe[data-testid="hosted-resources-iframe"]';
  await page.locator(sel).first().waitFor({ state: "attached", timeout: 30000 });
  let frameLocator = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const count = await page.locator(sel).count();
    for (let i = 0; i < count; i++) {
      const loc = page.locator(sel).nth(i);
      const box = await loc.boundingBox().catch(() => null);
      if (box && box.width > 40 && box.height > 40) {
        const fl = loc.contentFrame();
        const txt = await fl.locator("body").textContent().catch(() => null);
        if (txt && txt.replace(/\s+/g, "").length > 0) {
          frameLocator = fl;
          break;
        }
      }
    }
    if (frameLocator) break;
    await page.waitForTimeout(400);
  }
  if (!frameLocator) frameLocator = page.locator(sel).first().contentFrame();
  await frameLocator.locator(".tab-btn").first().waitFor({ state: "visible", timeout: 20000 });
  return frameLocator;
}

async function clickTab(page, frame, label) {
  const btn = frame.locator(".tab-btn", { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.waitForTimeout(900);
}

async function main() {
  console.log("Launching persistent context...");
  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    console.log("Navigating to CogniRunner admin deep link...");
    await page.goto(DEEP_LINK, { waitUntil: "domcontentloaded" });
    let frame = await enterAdminFrame(page);

    console.log("Clicking Settings tab...");
    await clickTab(page, frame, "Settings");
    await page.screenshot({ path: shotPath("settings-tab-loaded") });

    // Scroll the API access panel into view (it's below OpenAIConfig on the Settings tab).
    const apiHeading = frame.locator(".apx-title", { hasText: "API access" }).first();
    await apiHeading.waitFor({ state: "visible", timeout: 20000 });
    await apiHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shotPath("api-access-panel-before") });

    // Read the endpoint URL.
    const urlCode = frame.locator(".apx-url .apx-code").first();
    await urlCode.waitFor({ state: "visible", timeout: 20000 });
    const rulesApiUrl = (await urlCode.textContent()).trim();
    console.log("Rules API URL discovered (length):", rulesApiUrl.length);

    // NOTE: this installation's deployed admin-panel bundle is a version OLDER than the
    // current CogniRunner repo source -- it has no role picker at all (no .apx-roles-block,
    // no Role column in the token table; confirmed via innerHTML dump). Tokens minted here
    // are role-less legacy rows, which src/rules-api.js's own tokenRole() treats as ADMIN
    // (documented: "A token minted before roles existed counts as admin"). Proceeding
    // without a role selection -- the feature to narrow it does not exist on this install.
    const roleBtnCount = await frame.locator(".apx-role-btn").count();
    console.log("apx-role-btn count (0 = deployed bundle predates F-863 role picker):", roleBtnCount);

    // Name the token, create it.
    const nameInput = frame.locator(".apx-input").first();
    await nameInput.fill("CogniRunner demo config (leanzero-demo, 2026-09-15)");
    await frame.locator(".apx-create").first().click();

    const freshSecret = frame.locator(".apx-fresh .apx-secret").first();
    await freshSecret.waitFor({ state: "visible", timeout: 20000 });
    const token = (await freshSecret.textContent()).trim();
    console.log("Token minted (length):", token.length);
    await page.screenshot({ path: shotPath("api-token-minted") });

    fs.writeFileSync(OUT_FILE, JSON.stringify({ url: rulesApiUrl, token }, null, 2));
    console.log("Wrote token+url to local scratchpad file (not printed).");

    // Verify the row now shows in the table.
    const row = frame.locator(".apx-table tbody tr", { hasText: "CogniRunner demo config" }).first();
    await row.waitFor({ state: "visible", timeout: 10000 });
    console.log("Token row confirmed present in table.");
    await page.screenshot({ path: shotPath("api-token-row-in-table") });
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
