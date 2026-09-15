// Screenshots the Listeners and Scheduled Jobs admin tabs to visually confirm the REST-API-
// created rows ("New Vulnerability Triage" listener, "ITHELP/PLATSUP Stale Ticket Nudge" job)
// show up in the real admin UI too, not just via the REST API.
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const PROFILE_PATH =
  "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-cognirunner";
const DEEP_LINK =
  "https://leanzero-demo.atlassian.net/jira/apps/36415848-6868-4697-9554-3c3ad87b8da9/37dd35f1-42db-4e65-8e91-b2f18caed58d";
const EVIDENCE_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/cognirunner";

let shot = 21;
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
  await page.waitForTimeout(1200);
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());
  try {
    await page.goto(DEEP_LINK, { waitUntil: "domcontentloaded" });
    let frame = await enterAdminFrame(page);

    await clickTab(page, frame, "Listeners");
    await page.screenshot({ path: shotPath("listeners-tab") });
    console.log("Listeners tab text sample:", (await frame.locator("body").textContent()).slice(0, 400));

    await clickTab(page, frame, "Scheduled Jobs");
    await page.screenshot({ path: shotPath("scheduled-jobs-tab") });
    console.log("Scheduled Jobs tab text sample:", (await frame.locator("body").textContent()).slice(0, 400));
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
