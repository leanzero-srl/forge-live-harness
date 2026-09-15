// Second plan: HELIOS (24 issues, real "Blocks" link HELIOS-19->HELIOS-3, 10 issues already
// carry a real Due date). Creates the plan via JQL, schedules a few Start Dates (guarding
// against the ATLAS-11 due-collapse bug found earlier: if setting Start silently blanks/moves
// Due, re-set Due explicitly right after), Applies to real Jira, verifies live.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const PLAN_NAME = "HELIOS Research Plan";
const JQL = "project = HELIOS ORDER BY key ASC";

// [key, startISO, dueISO-expected (what it should be/stay after applying — for verification)]
const EDITS = [
  ["HELIOS-19", "2026-08-03", "2026-08-14"], // predecessor of HELIOS-3 (real Blocks link) — no due yet, set both
  ["HELIOS-3", "2026-08-17", "2026-08-20"],  // successor; due already real, must NOT collapse
  ["HELIOS-1", "2026-09-21", "2026-09-30"],  // due already real
  ["HELIOS-2", "2026-10-05", "2026-10-15"],  // due already real
];

async function bodyText(frame) { return (await frame.locator("body").innerText().catch(() => "")) || ""; }
async function dismissHostFlags(page) {
  await page.evaluate(() => { for (const sel of ["#aui-flag-container", '[data-testid="flag-group"]', '[data-testid$=".flag-group"]', "#jira-flags"]) document.querySelectorAll(sel).forEach((e) => { if (e.childElementCount) e.remove(); }); }).catch(() => {});
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

async function waitApplied(page, frame) {
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
  return { finalPhase, lastToast };
}

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1600, height: 1000 } });
let step = 30;
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

  console.log("=== Creating HELIOS plan via wizard ===");
  await frame.getByRole("button", { name: /New Plan/i }).first().click().catch(async () => {
    await frame.getByText(/New plan/i).first().click();
  });
  await page.waitForTimeout(1500);
  await frame.getByPlaceholder(/Q2 Release Plan/i).first().fill(PLAN_NAME);
  const continueBtn = () => frame.getByRole("button", { name: /Continue/i }).first();
  await continueBtn().click();
  await page.waitForTimeout(1200);
  const jqlInput = frame.getByPlaceholder(/project = PROJ/i).first();
  await jqlInput.fill(JQL);
  await frame.getByText(/✓ Valid/i).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "helios-w-sources-filled");
  await continueBtn().click(); await page.waitForTimeout(1000); // Schedule
  await shot(page, "helios-w-schedule");
  await continueBtn().click(); await page.waitForTimeout(1000); // Milestones
  await shot(page, "helios-w-milestones");
  console.log("MILESTONES BODY:", (await bodyText(frame)).slice(0, 600));
  await continueBtn().click(); await page.waitForTimeout(1000); // -> Review (if milestones has its own Continue)
  await shot(page, "helios-w-review");
  console.log("REVIEW BODY:", (await bodyText(frame)).slice(0, 800));
  const createBtn = frame.getByRole("button", { name: /Create\s*&?\s*Index/i }).first();
  await createBtn.click();
  await page.waitForTimeout(2000);

  let opened = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const txt = await bodyText(frame);
    if (/Gantt|Table/i.test(txt) && !/Indexing|Creating/i.test(txt)) { opened = true; break; }
  }
  console.log("Plan opened:", opened);
  await shot(page, "helios-plan-opened");

  console.log("=== Scheduling ===");
  await frame.getByRole("button", { name: /^Table/i }).first().click();
  await page.waitForTimeout(2000);

  for (const [key, startISO, expectedDue] of EDITS) {
    console.log(`=== Scheduling ${key}: start=${startISO} expectedDue=${expectedDue} ===`);
    const r = row(frame, key);
    await r.scrollIntoViewIfNeeded().catch(() => {});
    const startCell = r.locator(":scope > div").nth(3);
    await pickDate(page, frame, startCell, startISO);
    await page.waitForTimeout(400);
    const dueAfterStart = await r.getAttribute("data-row-due").catch(() => null);
    console.log(`  after setting start: due=${dueAfterStart}`);
    if (dueAfterStart !== expectedDue) {
      console.log(`  DUE MISMATCH (bug repro) — re-setting due to ${expectedDue}`);
      const dueCell = r.locator(":scope > div").nth(4);
      await pickDate(page, frame, dueCell, expectedDue);
      const dueAfterFix = await r.getAttribute("data-row-due").catch(() => null);
      console.log(`  after fixing due: due=${dueAfterFix}`);
    }
  }

  await shot(page, "helios-table-scheduled");
  for (const [key] of EDITS) {
    const r = row(frame, key);
    console.log(`  ${key}: start=${await r.getAttribute("data-row-start")} due=${await r.getAttribute("data-row-due")}`);
  }

  console.log("=== Applying to real Jira ===");
  const applyBtn = frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first();
  await applyBtn.click();
  await page.waitForTimeout(1500);
  await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 15000 });
  const modalRows = await frame.locator('[data-testid="apply-change-row"]').count();
  console.log("APPLY modal change rows:", modalRows);
  await shot(page, "helios-apply-review");
  await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();
  const { finalPhase, lastToast } = await waitApplied(page, frame);
  console.log("FINAL:", finalPhase, lastToast);
  await shot(page, "helios-apply-complete");

  console.log("HELIOS_SCRIPT_DONE finalPhase=" + finalPhase);
} catch (err) {
  console.error("SCRIPT ERROR:", err);
  process.exitCode = 1;
} finally {
  await context.close();
}
