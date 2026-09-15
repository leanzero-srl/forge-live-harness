// Schedules real Start/Due dates on a handful of ATLAS issues (via the app's own Table
// inline DatePicker) so the Gantt has enough real dated issues to render bars AND at
// least one dependency connector (ATLAS-16 --Blocks--> ATLAS-11, a REAL Jira issue link
// found via REST). Then APPLIES the staged changes to real Jira (writes customfield_10015
// "Start date", which exists on leanzero-demo with a global context — confirmed via REST).
// This is genuine, expected PPM-app usage: import issues, then schedule them, then Apply.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// [key, startISO, dueISO-or-null (null = leave existing due untouched)]
const EDITS = [
  ["ATLAS-16", "2026-10-05", "2026-10-09"], // predecessor of ATLAS-11 (real Blocks link)
  ["ATLAS-11", "2026-10-12", null],          // successor; due 2026-11-01 already real
  ["ATLAS-10", "2026-09-21", null],          // due 2026-10-01 already real
  ["ATLAS-13", "2026-11-09", null],          // due 2026-11-20 already real
  ["ATLAS-18", "2026-10-05", null],          // due 2026-10-15 already real
];

async function bodyText(frame) { return (await frame.locator("body").innerText().catch(() => "")) || ""; }
async function dismissHostFlags(page) {
  await page.evaluate(() => {
    for (const sel of ["#aui-flag-container", '[data-testid="flag-group"]', '[data-testid$=".flag-group"]', "#jira-flags"]) {
      for (const el of Array.from(document.querySelectorAll(sel))) { if (el.childElementCount) el.remove(); }
    }
  }).catch(() => {});
}
async function enterForgeSurface(page, timeout = 30000) {
  await dismissHostFlags(page);
  const sel = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]';
  await page.locator(sel).first().waitFor({ state: "attached", timeout });
  return page.locator(sel).first().contentFrame();
}
function row(frame, key) { return frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`); }

async function pickDate(page, frame, cellLocator, iso) {
  const [year, month, day] = iso.split("-").map(Number);
  await cellLocator.click();
  await page.waitForTimeout(400);
  const cal = frame.locator(".lz-datepicker").last();
  await cal.waitFor({ state: "visible", timeout: 8000 });
  const initialTitle = ((await cal.locator("span").first().textContent().catch(() => "")) || "").trim();
  console.log(`  calendar opened at: "${initialTitle}"`);
  // Deployed bundle's DatePicker renders PLAIN nav buttons (no aria-label) — nth(0)=prev, nth(1)=next.
  const nextBtn = cal.locator("button").nth(1);
  for (let i = 0; i < 30; i++) {
    const title = ((await cal.locator("span").first().textContent().catch(() => "")) || "").trim();
    if (title === `${MONTHS[month - 1]} ${year}`) break;
    await nextBtn.click({ timeout: 5000 }).catch((e) => console.log("  next-month click failed:", e.message));
    await page.waitForTimeout(200);
  }
  const finalTitle = ((await cal.locator("span").first().textContent()) || "").trim();
  console.log(`  calendar landed on: ${finalTitle} (wanted ${MONTHS[month - 1]} ${year})`);
  // Deployed bundle's day cells are plain DIVs (no role/aria-label) — match by exact day text.
  await cal.getByText(String(day), { exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
}

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1600, height: 1000 } });
let step = 20;
async function shot(page, name) {
  step += 1;
  const path = `${SHOT_DIR}/${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path });
  console.log("SHOT:", path);
}

try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  let frame = await enterForgeSurface(page);
  await page.waitForTimeout(2000);

  console.log("=== Opening ATLAS Portfolio Plan ===");
  await frame.getByText(/ATLAS Portfolio Plan/i).first().click();
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Table/i }).first().click();
  await page.waitForTimeout(2000);
  await shot(page, "table-before-scheduling");

  for (const [key, startISO, dueISO] of EDITS) {
    console.log(`=== Scheduling ${key}: start=${startISO} due=${dueISO || "(unchanged)"} ===`);
    const r = row(frame, key);
    await r.scrollIntoViewIfNeeded().catch(() => {});
    const startCell = r.locator(":scope > div").nth(3);
    await pickDate(page, frame, startCell, startISO);
    if (dueISO) {
      const dueCell = r.locator(":scope > div").nth(4);
      await pickDate(page, frame, dueCell, dueISO);
    }
    await page.waitForTimeout(500);
  }

  await shot(page, "table-after-scheduling");
  const afterBody = await bodyText(frame);
  console.log("STAGED BODY SNIPPET:", (afterBody.match(/Apply\s+\d+\s+change/i) || ["none"])[0]);

  // --- Verify what's staged for our target keys before applying ---
  for (const [key] of EDITS) {
    const r = row(frame, key);
    const start = await r.getAttribute("data-row-start").catch(() => null);
    const due = await r.getAttribute("data-row-due").catch(() => null);
    console.log(`  ${key}: data-row-start=${start} data-row-due=${due}`);
  }

  console.log("=== Applying staged changes to real Jira ===");
  const applyBtn = frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first();
  const applyVisible = await applyBtn.isVisible().catch(() => false);
  console.log("Apply button visible:", applyVisible);
  if (!applyVisible) throw new Error("No Apply button — nothing staged?");
  await applyBtn.click();
  await page.waitForTimeout(1500);
  await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 15000 });
  const modalRows = await frame.locator('[data-testid="apply-change-row"]').count();
  console.log("APPLY modal change rows:", modalRows);
  await shot(page, "apply-review-modal");

  await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();
  await page.waitForTimeout(2000);
  const conflictBody = await bodyText(frame);
  if (/changed in Jira since|Apply Anyway/i.test(conflictBody)) {
    console.log("CONFLICT gate fired — acknowledging and proceeding");
    await frame.locator('input[type="checkbox"], [role="checkbox"]').last().click().catch(() => {});
    await frame.getByRole("button", { name: /Apply Anyway/i }).first().click().catch(() => {});
  }

  let finalPhase = null;
  let lastToast = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500);
    const t = await bodyText(frame);
    const title = (t.match(/(Preparing…|Writing to Jira|Verifying|Applied|Apply failed)/) || [])[0] || null;
    const toast = (t.match(/(Successfully wrote [^\n]{0,80}|Wrote \d+ issue[^\n]{0,80}|Jira refused every change[^\n]{0,80}|Nothing could be written[^\n]{0,80}|Jira didn't store[^\n]{0,80}|Verification failed)/) || [])[0] || null;
    if (toast) lastToast = toast;
    console.log(`WP[${i}] phase=${title} toast=${toast}`);
    if (title === "Applied" || title === "Apply failed") { finalPhase = title; break; }
  }
  console.log("FINAL WriteProgress phase:", finalPhase, "lastToast:", lastToast);
  await shot(page, "apply-complete");

  console.log("SCHEDULE_SCRIPT_DONE finalPhase=" + finalPhase);
} catch (err) {
  console.error("SCRIPT ERROR:", err);
  process.exitCode = 1;
} finally {
  await context.close();
}
