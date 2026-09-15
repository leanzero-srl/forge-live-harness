// Creates a THIRD real Plan on leanzero-demo.atlassian.net for LeanZero Management (lz-ppm-forge),
// sourced from real Jira data: project = PRISM (Prism Data Platform, ~23 real issues at build time —
// bulk issue-gen may have added more unassigned filler since; PRISM-1..~26 are the real seeded data).
// PRISM has the widest real due-date coverage of the untouched projects (21/23 issues carry a real
// Due date) and 12 real parent(epic) links across 2 epics (PRISM-1, PRISM-2) — good for demonstrating
// epic rollup, same technique HELIOS used. PRISM has NO real "Blocks" links (only "Relates", confirmed
// via REST incl. the cross-project PRISM-12<->ATLAS-15 link) so this plan does not carry a dependency
// connector on its own — GROWTH (a separate script) supplies that.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";
const PLAN_NAME = "PRISM Data Platform Plan";
const JQL = "project = PRISM ORDER BY key ASC";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// [key, startISO] — all these already carry a real Due date from the original data build; we
// ONLY set Start via the Table DatePicker, leaving Due untouched (watch for the known Due-collapse
// bug: setting only Start on an issue with an existing Due can silently snap Due=Start on Apply).
const EDITS = [
  ["PRISM-3", "2026-03-20"],  // child of Epic PRISM-1, due 2026-04-10
  ["PRISM-4", "2026-04-15"],  // child of Epic PRISM-1, due 2026-05-02
  ["PRISM-5", "2026-10-05"],  // child of Epic PRISM-1, due 2026-10-20
  ["PRISM-6", "2026-09-10"],  // child of Epic PRISM-1, due 2026-09-25
  ["PRISM-14", "2026-09-28"], // Story child of Epic PRISM-1, due 2026-10-10
  ["PRISM-16", "2026-07-15"], // child of Epic PRISM-2, due 2026-08-01
  ["PRISM-17", "2026-09-15"], // child of Epic PRISM-2, due 2026-09-30
  ["PRISM-21", "2026-06-20"], // child of Epic PRISM-2, due 2026-07-03
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
  const nextBtn = cal.locator("button").nth(1);
  const prevBtn = cal.locator("button").nth(0);
  for (let i = 0; i < 36; i++) {
    const title = ((await cal.locator("span").first().textContent().catch(() => "")) || "").trim();
    const wanted = `${MONTHS[month - 1]} ${year}`;
    if (title === wanted) break;
    // Bidirectional nav: figure out which direction to go from the title text.
    const m = title.match(/^(\w+)\s+(\d{4})$/);
    if (m) {
      const curMonthIdx = MONTHS.indexOf(m[1]);
      const curYear = Number(m[2]);
      const curOrdinal = curYear * 12 + curMonthIdx;
      const wantOrdinal = year * 12 + (month - 1);
      if (wantOrdinal > curOrdinal) await nextBtn.click({ timeout: 5000 }).catch(() => {});
      else await prevBtn.click({ timeout: 5000 }).catch(() => {});
    } else {
      await nextBtn.click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(200);
  }
  const finalTitle = ((await cal.locator("span").first().textContent()) || "").trim();
  console.log(`  calendar landed on: ${finalTitle} (wanted ${MONTHS[month - 1]} ${year})`);
  await cal.getByText(String(day), { exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
}

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1600, height: 1000 } });
let step = 53;
async function shot(page, name) {
  step += 1;
  const path = `${SHOT_DIR}/${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path });
  console.log("SHOT:", path);
}

try {
  const page = context.pages()[0] || (await context.newPage());
  console.log("=== Navigating to LeanZero Management global page ===");
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  let frame = await enterForgeSurface(page);
  await page.waitForTimeout(2000);
  await shot(page, "prism-plans-list-before");

  console.log("=== Clicking + New Plan ===");
  await frame.getByRole("button", { name: /New Plan/i }).first().click().catch(async () => {
    await frame.getByText(/New plan/i).first().click();
  });
  await page.waitForTimeout(1500);

  console.log("=== Step 1: Name ===");
  const nameInput = frame.getByPlaceholder(/Q2 Release Plan/i).first();
  await nameInput.waitFor({ state: "visible", timeout: 15000 });
  await nameInput.fill(PLAN_NAME);
  await page.waitForTimeout(500);
  const continueBtn = () => frame.getByRole("button", { name: /Continue/i }).first();
  await continueBtn().click();
  await page.waitForTimeout(1200);
  await shot(page, "prism-wizard-step2-sources");

  console.log("=== Step 2: Sources (JQL) ===");
  const jqlInput = frame.getByPlaceholder(/project = PROJ/i).first();
  if (await jqlInput.isVisible().catch(() => false)) {
    await jqlInput.fill(JQL);
    await frame.getByText(/✓ Valid/i).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  console.log("Continue enabled after JQL:", await continueBtn().isEnabled().catch(() => null));
  await continueBtn().click();
  await page.waitForTimeout(1200);

  console.log("=== Step 3: Schedule (defaults) ===");
  await continueBtn().click();
  await page.waitForTimeout(1200);

  console.log("=== Step 4: Milestones (skip) ===");
  await continueBtn().click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "prism-wizard-review");

  console.log("=== Final step: Create & Index ===");
  const createBtn = frame.getByRole("button", { name: /Create\s*&?\s*Index/i }).first();
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
  } else {
    await continueBtn().click().catch(() => {});
    await page.waitForTimeout(1000);
    await frame.getByRole("button", { name: /Create\s*&?\s*Index/i }).first().click().catch((e) => {
      console.log("Could not find Create & Index button:", e.message);
    });
  }
  await page.waitForTimeout(2000);
  await shot(page, "prism-after-create-click");

  console.log("=== Waiting for plan to open / index ===");
  let opened = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const txt = await bodyText(frame);
    if (/Gantt|Table/i.test(txt) && !/Indexing|Creating/i.test(txt)) { opened = true; break; }
    if (i % 5 === 0) console.log(`  ...waiting (${i * 3}s)`);
  }
  console.log("Plan opened:", opened);
  await shot(page, "prism-plan-opened");
  const openedBody = await bodyText(frame);
  const idxCount = (openedBody.match(/Showing\s+[\d,]+\s+of\s+[\d,]+/i) || [])[0] || "none";
  console.log("INDEXED:", idxCount);

  console.log("=== Table view, scheduling Start dates ===");
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "prism-table-before-scheduling");

  for (const [key, startISO] of EDITS) {
    console.log(`=== Scheduling ${key}: start=${startISO} ===`);
    const r = row(frame, key);
    await r.scrollIntoViewIfNeeded().catch(() => {});
    const startCell = r.locator(":scope > div").nth(3);
    await pickDate(page, frame, startCell, startISO);
    await page.waitForTimeout(400);
  }
  await shot(page, "prism-table-after-scheduling");

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
  await shot(page, "prism-apply-review-modal");

  await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();
  await page.waitForTimeout(2000);
  const conflictBody = await bodyText(frame);
  if (/changed in Jira since|Apply Anyway/i.test(conflictBody)) {
    console.log("CONFLICT gate fired — acknowledging and proceeding");
    await frame.locator('input[type="checkbox"], [role="checkbox"]').last().click().catch(() => {});
    await frame.getByRole("button", { name: /Apply Anyway/i }).first().click().catch(() => {});
  }

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
  console.log("FINAL WriteProgress phase:", finalPhase, "lastToast:", lastToast);
  await shot(page, "prism-apply-complete");

  console.log("PRISM_CREATE_SCRIPT_DONE finalPhase=" + finalPhase);
} catch (err) {
  console.error("SCRIPT ERROR:", err);
  process.exitCode = 1;
} finally {
  await context.close();
}
