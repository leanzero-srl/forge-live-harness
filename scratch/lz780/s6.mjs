// Item 3b: REST holiday path + timestamped toast capture on BOTH clients
import { chromium } from "playwright";
import { rest } from "./rest.mjs";
const SHOTS = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz780/shots";
const APP = "https://wolfaenpak.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77";
const PLAN_NAME = "LZ780 Rollout programme (tester)";
const PLAN = process.env.PLAN_ID, HOLIDAY = "2026-09-23";
const openCtx = async (profile) => {
  const ctx = await chromium.launchPersistentContext(`/Users/mihaiperdum/Projects/forge-live-harness/.auth/${profile}`, {
    headless: true, viewport: { width: 1500, height: 1000 }, args: ["--disable-blink-features=AutomationControlled"] });
  await ctx.addInitScript(() => { const css = document.createElement('style');
    css.textContent = '#aui-flag-container,[id^="aui-flag"]{pointer-events:none !important;}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css)); });
  const page = ctx.pages()[0] || await ctx.newPage();
  return { ctx, page }; };
const appFrame = async (page, timeout = 120000) => { const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) {
      try { if (await fr.locator('#root, .lz-appbar').first().count()) return fr; } catch {} }
    await page.waitForTimeout(700); } throw new Error("frame"); };
const openPlan = async (page, f) => {
  for (let i=0;i<60;i++){ const t = await f.locator('body').innerText().catch(()=>""); if (t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
  await f.locator(`text=${PLAN_NAME}`).first().click();
  for (let i=0;i<60;i++){ if (await f.locator('[data-testid="derived-count-chip"], [data-testid="gantt-bar"]').first().count()) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(3000); };
const observe = (f) => f.evaluate(() => {
  window.__toasts = [];
  const seen = new Set();
  const scan = () => document.querySelectorAll('.toast-enter, .toast-exit, [role="status"], [role="alert"]').forEach((el) => {
    const t = el.innerText.trim(); if (t && !seen.has(t)) { seen.add(t); window.__toasts.push({ t: Date.now(), text: t }); } });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
  scan();
});
const toasts = (f) => f.evaluate(() => window.__toasts || []);

const A = await openCtx("profile");
await A.page.goto(APP, { waitUntil: "domcontentloaded" });
const fa = await appFrame(A.page); await openPlan(A.page, fa);
await fa.locator('button:has-text("Table")').first().click(); await A.page.waitForTimeout(3500);
const B = await openCtx("profile-critic4");
await B.page.goto(APP, { waitUntil: "domcontentloaded" });
const fb = await appFrame(B.page); await openPlan(B.page, fb);
await fb.locator('button:has-text("Schedule")').first().click(); await B.page.waitForTimeout(3000);
await fb.locator('button:has-text("Holidays"), button:has-text("Bank Holidays")').first().click().catch(()=>{});
await B.page.waitForTimeout(1500);
await observe(fa); await observe(fb);
const rowDue = async (f, k) => f.locator(`[data-testid="table-row"][data-row-key="${k}"]`).getAttribute("data-row-due");

// ---- UI path on B, timestamped ----
await fb.locator('button[aria-label="Choose date"], button[aria-haspopup="dialog"]').first().click();
await B.page.waitForTimeout(800);
await fb.locator(`button[aria-label="${HOLIDAY}"]`).first().click();
await B.page.waitForTimeout(400);
await fb.locator('input[placeholder^="Holiday name"]').fill("LZ780 probe shutdown");
const t0 = await B.page.evaluate(() => Date.now());
await fb.locator('button:has-text("Add")').first().click();
let tD = 0;
for (let i=0;i<120;i++){ const v = await rowDue(fa,"WFH-3707").catch(()=>null); if (v && v!=="2026-09-25"){ tD = Date.now(); break; } await A.page.waitForTimeout(400); }
console.log("UI PATH: A re-derive latency", tD ? ((tD-t0)/1000).toFixed(2)+"s" : "NEVER", "3707 ->", await rowDue(fa,"WFH-3707"));
await B.page.waitForTimeout(16000);
console.log("A TOASTS:", JSON.stringify((await toasts(fa)).map(x=>({dt:((x.t-t0)/1000).toFixed(2), text:x.text.replace(/\n/g,' ')})), null, 0));
console.log("B TOASTS:", JSON.stringify((await toasts(fb)).map(x=>({dt:((x.t-t0)/1000).toFixed(2), text:x.text.replace(/\n/g,' ')})), null, 0));
// remove via UI
await fb.locator('button[title="Remove"]').first().click();
for (let i=0;i<120;i++){ if ((await rowDue(fa,"WFH-3707").catch(()=>null))==="2026-09-25") break; await A.page.waitForTimeout(400); }
console.log("removed; A 3707", await rowDue(fa,"WFH-3707"));
await A.page.waitForTimeout(2000);

// ---- REST path ----
await fa.evaluate(() => { window.__toasts = []; }); await fb.evaluate(() => { window.__toasts = []; });
const t1 = Date.now();
const r = await rest(`resource=schedule&planId=${PLAN}&action=holiday`, { method:"POST", body:{ date: HOLIDAY, name: "LZ780 REST shutdown" } });
console.log("REST holiday POST:", r.status, JSON.stringify(r).slice(0,220));
let tR = 0;
for (let i=0;i<150;i++){ const v = await rowDue(fa,"WFH-3707").catch(()=>null); if (v && v!=="2026-09-25"){ tR = Date.now(); break; } await A.page.waitForTimeout(400); }
console.log("REST PATH: A re-derive latency", tR ? ((tR-t1)/1000).toFixed(2)+"s" : "NEVER (60s)", "3707 ->", await rowDue(fa,"WFH-3707"));
await A.page.waitForTimeout(3000);
console.log("A TOASTS (rest):", JSON.stringify((await toasts(fa)).map(x=>({dt:((x.t-t1)/1000).toFixed(2), text:x.text.replace(/\n/g,' ')}))));
console.log("B TOASTS (rest):", JSON.stringify((await toasts(fb)).map(x=>({dt:((x.t-t1)/1000).toFixed(2), text:x.text.replace(/\n/g,' ')}))));
await A.page.screenshot({ path: `${SHOTS}/3-rest-A.png` });
// cleanup: remove the REST holiday
const rm = await rest(`resource=schedule&planId=${PLAN}&action=holiday&date=${HOLIDAY}`, { method:"DELETE" });
console.log("REST holiday DELETE:", rm.status, JSON.stringify(rm).slice(0,200));
for (let i=0;i<120;i++){ if ((await rowDue(fa,"WFH-3707").catch(()=>null))==="2026-09-25") break; await A.page.waitForTimeout(400); }
console.log("final A 3707", await rowDue(fa,"WFH-3707"));
const cal = await rest(`resource=schedule&planId=${PLAN}`);
console.log("final calendar:", JSON.stringify(cal).slice(0,300));
await B.ctx.close(); await A.ctx.close();
