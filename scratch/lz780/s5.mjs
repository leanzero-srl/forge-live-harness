// Item 3: two clients — B declares a holiday, A re-derives without losing its unsaved edit
import { chromium } from "playwright";
const SHOTS = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz780/shots";
const APP = "https://wolfaenpak.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77";
const PLAN_NAME = "LZ780 Rollout programme (tester)";
const HOLIDAY = "2026-09-23";
const openCtx = async (profile) => {
  const ctx = await chromium.launchPersistentContext(`/Users/mihaiperdum/Projects/forge-live-harness/.auth/${profile}`, {
    headless: true, viewport: { width: 1500, height: 1000 }, args: ["--disable-blink-features=AutomationControlled"] });
  await ctx.addInitScript(() => { const css = document.createElement('style');
    css.textContent = '#aui-flag-container,[id^="aui-flag"]{pointer-events:none !important;}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css)); });
  const page = ctx.pages()[0] || await ctx.newPage();
  return { ctx, page };
};
const appFrame = async (page, timeout = 120000) => { const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) {
      try { if (await fr.locator('#root, .lz-appbar, [data-testid="plans-page"]').first().count()) return fr; } catch {} }
    await page.waitForTimeout(700); }
  throw new Error("frame"); };
const openPlan = async (page, f) => {
  for (let i=0;i<60;i++){ const t = await f.locator('body').innerText().catch(()=>""); if (t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
  await f.locator(`text=${PLAN_NAME}`).first().click();
  for (let i=0;i<60;i++){ if (await f.locator('[data-testid="derived-count-chip"], [data-testid="gantt-bar"]').first().count()) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(3000); };
const shot = async (p, n) => { await p.screenshot({ path: `${SHOTS}/${n}.png` }); console.log("SHOT", n); };

// ---------- CLIENT A ----------
const A = await openCtx("profile");
await A.page.goto(APP, { waitUntil: "domcontentloaded" });
const fa = await appFrame(A.page);
await openPlan(A.page, fa);
await fa.locator('button:has-text("Table")').first().click();
await A.page.waitForTimeout(4000);
// unsaved local edit: WFH-3714 due 2026-10-23 -> 2026-10-26
const cell = fa.locator('[data-testid="table-row"][data-row-key="WFH-3714"] [data-field], [data-testid="table-row"][data-row-key="WFH-3714"]').first();
await fa.locator('[data-testid="table-row"][data-row-key="WFH-3714"]').first().scrollIntoViewIfNeeded();
const cells = fa.locator('[data-testid="table-row"][data-row-key="WFH-3714"] > div');
const nCells = await cells.count();
let clicked = false;
for (let i = 0; i < nCells; i++) {
  const t = (await cells.nth(i).innerText()).trim();
  if (/Oct 23/.test(t)) { await cells.nth(i).click(); clicked = true; console.log("clicked due cell idx", i, JSON.stringify(t)); break; }
}
if (!clicked) console.log("DUE CELL NOT FOUND; row text:", JSON.stringify(await fa.locator('[data-testid="table-row"][data-row-key="WFH-3714"]').innerText()));
await A.page.waitForTimeout(1200);
const day = fa.locator('button[aria-label="2026-10-26"]');
console.log("day button count", await day.count());
await day.first().click();
await A.page.waitForTimeout(2000);
const saveBtn = fa.locator('[data-testid="plan-save-btn"]');
console.log("A SAVE STATE:", await saveBtn.innerText(), await saveBtn.getAttribute("data-save-state"));
console.log("A row 3714 due:", await fa.locator('[data-testid="table-row"][data-row-key="WFH-3714"]').getAttribute("data-row-due"));
await fa.evaluate(() => { window.__lzNoReload = "alive"; });
const rowDue = async (k) => fa.locator(`[data-testid="table-row"][data-row-key="${k}"]`).getAttribute("data-row-due");
console.log("A BEFORE dues:", "3707", await rowDue("WFH-3707"), "3708", await rowDue("WFH-3708"), "3709", await rowDue("WFH-3709"));
await shot(A.page, "3-A-before");

// ---------- CLIENT B ----------
const B = await openCtx("profile-critic4");
await B.page.goto(APP, { waitUntil: "domcontentloaded" });
const fb = await appFrame(B.page);
await openPlan(B.page, fb);
await fb.locator('button:has-text("Schedule")').first().click();
await B.page.waitForTimeout(3000);
await fb.locator('button:has-text("Holidays"), button:has-text("Bank Holidays")').first().click().catch(()=>{});
await B.page.waitForTimeout(1500);
await shot(B.page, "3-B-schedule");
await fb.locator('button[aria-label="Choose date"], button[aria-haspopup="dialog"]').first().click();
await B.page.waitForTimeout(1000);
const d = fb.locator(`button[aria-label="${HOLIDAY}"]`);
console.log("B holiday day button count", await d.count());
await d.first().click();
await B.page.waitForTimeout(600);
await fb.locator('input[placeholder^="Holiday name"]').fill("LZ780 probe shutdown");
const t0 = Date.now();
await fb.locator('button:has-text("Add")').first().click();
console.log("B clicked Add at t0");
await B.page.waitForTimeout(1500);
await shot(B.page, "3-B-added");

// ---------- MEASURE ON A ----------
let tDerive = 0;
for (let i = 0; i < 120; i++) {
  const v = await rowDue("WFH-3707").catch(()=>null);
  if (v && v !== "2026-09-25") { tDerive = Date.now(); console.log("A 3707 due ->", v); break; }
  await A.page.waitForTimeout(500);
}
console.log("LATENCY A re-derive:", tDerive ? ((tDerive - t0)/1000).toFixed(1) + "s" : "NEVER (60s)");
console.log("A AFTER dues:", "3707", await rowDue("WFH-3707"), "3708", await rowDue("WFH-3708"), "3709", await rowDue("WFH-3709"), "3714", await rowDue("WFH-3714"));
console.log("A save state after:", await saveBtn.innerText(), await saveBtn.getAttribute("data-save-state"));
console.log("A no-reload marker:", await fa.evaluate(() => window.__lzNoReload || "(GONE — frame reloaded)"));
const noticesA = await fa.locator('.toast-enter, .toast-exit, [role="status"], [role="alert"]').allInnerTexts().catch(()=>[]);
console.log("A notices:", JSON.stringify(noticesA));
await shot(A.page, "3-A-after");
const noticesB = await fb.locator('.toast-enter, .toast-exit, [role="status"], [role="alert"]').allInnerTexts().catch(()=>[]);
console.log("B self-notices (within ~15s):", JSON.stringify(noticesB));
await B.page.waitForTimeout(14000);
const noticesB2 = await fb.locator('.toast-enter, .toast-exit, [role="status"], [role="alert"]').allInnerTexts().catch(()=>[]);
console.log("B self-notices at 15s:", JSON.stringify(noticesB2));

// ---------- REMOVE ON B, A REVERTS ----------
const t1 = Date.now();
await fb.locator('button[title="Remove"]').first().click();
console.log("B removed holiday");
let tRevert = 0;
for (let i = 0; i < 120; i++) {
  const v = await rowDue("WFH-3707").catch(()=>null);
  if (v === "2026-09-25") { tRevert = Date.now(); break; }
  await A.page.waitForTimeout(500);
}
console.log("A revert latency:", tRevert ? ((tRevert - t1)/1000).toFixed(1) + "s" : "NEVER (60s)");
console.log("A dues after revert:", "3707", await rowDue("WFH-3707"), "3708", await rowDue("WFH-3708"), "3714", await rowDue("WFH-3714"));
console.log("A save state final:", await saveBtn.innerText());
console.log("A marker final:", await fa.evaluate(() => window.__lzNoReload || "(GONE)"));
await shot(A.page, "3-A-reverted");
await B.ctx.close(); await A.ctx.close();
