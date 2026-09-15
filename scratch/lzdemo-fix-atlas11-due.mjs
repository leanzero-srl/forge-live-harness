// Restore ATLAS-11's ORIGINAL real due date (2026-11-01, set during the site's data build)
// which got silently overwritten to match its Start Date when the Start Date was set via
// the Table (a live-discovered app bug — setting Start collapsed Due to the same day).
import { chromium } from "@playwright/test";
const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

async function bodyText(frame) { return (await frame.locator("body").innerText().catch(() => "")) || ""; }
async function dismissHostFlags(page) {
  await page.evaluate(() => { for (const sel of ["#aui-flag-container"]) document.querySelectorAll(sel).forEach(e=>e.remove()); }).catch(()=>{});
}
async function enterForgeSurface(page, timeout = 30000) {
  await dismissHostFlags(page);
  const sel = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]';
  await page.locator(sel).first().waitFor({ state: "attached", timeout });
  return page.locator(sel).first().contentFrame();
}
async function pickDate(page, frame, cellLocator, iso) {
  const [year, month, day] = iso.split("-").map(Number);
  await cellLocator.click();
  await page.waitForTimeout(400);
  const cal = frame.locator(".lz-datepicker").last();
  await cal.waitFor({ state: "visible", timeout: 8000 });
  const nextBtn = cal.locator("button").nth(1);
  for (let i = 0; i < 30; i++) {
    const title = ((await cal.locator("span").first().textContent().catch(() => "")) || "").trim();
    if (title === `${MONTHS[month - 1]} ${year}`) break;
    await nextBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  await cal.getByText(String(day), { exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
}

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1600, height: 1000 } });
try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const frame = await enterForgeSurface(page);
  await page.waitForTimeout(2000);
  await frame.getByText(/ATLAS Portfolio Plan/i).first().click();
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Table/i }).first().click();
  await page.waitForTimeout(2000);

  const r = frame.locator('[data-testid="table-row"][data-row-key="ATLAS-11"]');
  await r.scrollIntoViewIfNeeded().catch(() => {});
  console.log("BEFORE FIX: start=", await r.getAttribute("data-row-start"), "due=", await r.getAttribute("data-row-due"));
  const dueCell = r.locator(":scope > div").nth(4);
  await pickDate(page, frame, dueCell, "2026-11-01");
  console.log("AFTER EDIT (staged): start=", await r.getAttribute("data-row-start"), "due=", await r.getAttribute("data-row-due"));
  await page.screenshot({ path: `${SHOT_DIR}/25-atlas11-due-fix-staged.png` });

  const applyBtn = frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first();
  await applyBtn.click();
  await page.waitForTimeout(1500);
  await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 15000 });
  await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();

  let finalPhase = null, lastToast = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500);
    const t = await bodyText(frame);
    const title = (t.match(/(Preparing…|Writing to Jira|Verifying|Applied|Apply failed)/) || [])[0] || null;
    const toast = (t.match(/(Successfully wrote [^\n]{0,80}|Wrote \d+ issue[^\n]{0,80}|Jira refused every change[^\n]{0,80}|Nothing could be written[^\n]{0,80}|Jira didn't store[^\n]{0,80}|Verification failed)/) || [])[0] || null;
    if (toast) lastToast = toast;
    console.log(`WP[${i}] phase=${title} toast=${toast}`);
    if (title === "Applied" || title === "Apply failed") { finalPhase = title; break; }
  }
  console.log("FINAL:", finalPhase, lastToast);
  await page.screenshot({ path: `${SHOT_DIR}/26-atlas11-due-fix-applied.png` });
} finally {
  await context.close();
}
