// Resume: the HELIOS Research Plan already exists (created by lzdemo-helios-plan.mjs).
// That run's forward-only month navigation broke on a target month BEFORE "today"
// (Aug 2026 target vs Sep 2026 default open month) and drifted the DatePicker to 2029.
// Nothing was ever Applied (script errored before Apply), so Jira itself is untouched —
// this just re-drives the Table's inline DatePicker with a FIXED bidirectional nav,
// overwriting the bad staged values, then Applies for real.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const EDITS = [
  ["HELIOS-19", "2026-08-03", "2026-08-14"],
  ["HELIOS-3", "2026-08-17", "2026-08-20"],
  // HELIOS-1 is the EPIC parent of HELIOS-3/4/14 — its dates roll up automatically
  // (read-only "Rolled up" cell, confirmed live: Aug17->Sep7 after HELIOS-3 got dates).
  ["HELIOS-2", "2026-10-05", "2026-10-15"],
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

function parseTitle(title) {
  const [m, y] = title.split(" ");
  return { year: Number(y), month: MONTHS.indexOf(m) }; // 0-indexed month
}

async function pickDate(page, frame, cellLocator, iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const targetMonthIdx = month - 1;
  await cellLocator.click();
  await page.waitForTimeout(400);
  const cal = frame.locator(".lz-datepicker").last();
  await cal.waitFor({ state: "visible", timeout: 8000 });
  const prevBtn = cal.locator("button").nth(0);
  const nextBtn = cal.locator("button").nth(1);
  for (let i = 0; i < 60; i++) {
    const titleTxt = ((await cal.locator("span").first().textContent().catch(() => "")) || "").trim();
    const cur = parseTitle(titleTxt);
    if (cur.year === year && cur.month === targetMonthIdx) break;
    const curOrdinal = cur.year * 12 + cur.month;
    const targetOrdinal = year * 12 + targetMonthIdx;
    if (targetOrdinal < curOrdinal) await prevBtn.click({ timeout: 5000 }).catch(() => {});
    else await nextBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  const finalTitle = ((await cal.locator("span").first().textContent()) || "").trim();
  console.log(`  calendar landed on: ${finalTitle} (wanted ${MONTHS[targetMonthIdx]} ${year})`);
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
let step = 40;
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
  const frame = await enterForgeSurface(page);
  await page.waitForTimeout(2000);

  const listBody = await bodyText(frame);
  const heliosPlanCount = (listBody.match(/HELIOS Research Plan/g) || []).length;
  console.log("HELIOS Research Plan cards found on portfolio:", heliosPlanCount);

  await frame.getByText(/HELIOS Research Plan/i).first().click();
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Table/i }).first().click();
  await page.waitForTimeout(2000);

  for (const [key, startISO, expectedDue] of EDITS) {
    console.log(`=== Scheduling ${key}: start=${startISO} expectedDue=${expectedDue} ===`);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
    const openCalsBefore = await frame.locator(".lz-datepicker").count().catch(() => -1);
    console.log(`  open calendars before this issue: ${openCalsBefore}`);
    const r = row(frame, key);
    await r.scrollIntoViewIfNeeded().catch(() => {});
    const curStart = await r.getAttribute("data-row-start").catch(() => null);
    const curDue = await r.getAttribute("data-row-due").catch(() => null);
    if (curStart === startISO && curDue === expectedDue) {
      console.log(`  already correct (start=${curStart} due=${curDue}) — skipping`);
      continue;
    }
    const startCell = r.locator(":scope > div").nth(3);
    const rowCount = await r.count().catch(() => -1);
    const cellBox = await startCell.boundingBox().catch(() => null);
    console.log(`  rowCount=${rowCount} startCellBox=${JSON.stringify(cellBox)}`);
    await shot(page, `helios-before-${key}`);
    await pickDate(page, frame, startCell, startISO);
    await page.waitForTimeout(400);
    let dueAfterStart = await r.getAttribute("data-row-due").catch(() => null);
    console.log(`  after setting start: due=${dueAfterStart}`);
    if (dueAfterStart !== expectedDue) {
      console.log(`  setting due explicitly to ${expectedDue}`);
      const dueCell = r.locator(":scope > div").nth(4);
      await pickDate(page, frame, dueCell, expectedDue);
      dueAfterStart = await r.getAttribute("data-row-due").catch(() => null);
      console.log(`  after fixing due: due=${dueAfterStart}`);
    }
    const startNow = await r.getAttribute("data-row-start").catch(() => null);
    if (startNow !== startISO) {
      console.log(`  START ALSO DRIFTED (${startNow}) — re-setting start to ${startISO}`);
      await pickDate(page, frame, startCell, startISO);
    }
  }

  await shot(page, "helios-table-scheduled-fixed");
  for (const [key] of EDITS) {
    const r = row(frame, key);
    console.log(`  FINAL ${key}: start=${await r.getAttribute("data-row-start")} due=${await r.getAttribute("data-row-due")}`);
  }

  console.log("=== Applying to real Jira ===");
  const applyBtn = frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first();
  const applyVisible = await applyBtn.isVisible().catch(() => false);
  console.log("Apply visible:", applyVisible, "text:", await applyBtn.textContent().catch(() => "?"));
  await applyBtn.click();
  await page.waitForTimeout(1500);
  await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 15000 });
  const modalRows = await frame.locator('[data-testid="apply-change-row"]').count();
  console.log("APPLY modal change rows:", modalRows);
  await shot(page, "helios-apply-review-fixed");
  await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();
  const { finalPhase, lastToast } = await waitApplied(page, frame);
  console.log("FINAL:", finalPhase, lastToast);
  await shot(page, "helios-apply-complete-fixed");

  console.log("HELIOS_FIX_DONE finalPhase=" + finalPhase);
} catch (err) {
  console.error("SCRIPT ERROR:", err);
  process.exitCode = 1;
} finally {
  await context.close();
}
