// Item 6: editDrops toast on a REAL whole-plan rebuild
import { open, appFrame, shot, openPlan, APP, P1_NAME } from "./drive.mjs";
import { rest, hook } from "./rest.mjs";
import { put } from "../../data/jira.mjs";
const PLAN = process.env.PLAN_ID, KEY = "WFH-3714";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P1_NAME);
await f.locator('button:has-text("Table")').first().click(); await page.waitForTimeout(3500);
await f.evaluate(() => { window.__toasts = []; const seen = new Set();
  const scan = () => document.querySelectorAll('.toast-enter, .toast-exit, [role="status"], [role="alert"]').forEach((el) => {
    const t = el.innerText.trim(); if (t && !seen.has(t)) { seen.add(t); window.__toasts.push({ t: Date.now(), text: t }); } });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true }); scan(); });
const dues = async () => f.locator(`[data-testid="table-row"][data-row-key="${KEY}"]`).getAttribute("data-row-due");
console.log("before:", await dues());
// 1. a SAVED edit through the real path (stored row != Jira)
const ae = await hook(`what=applyEdit&planId=${PLAN}&key=${KEY}&field=dueDate&value=2026-11-06`);
console.log("applyEdit:", JSON.stringify(ae).slice(0, 160));
const t0 = Date.now();
// 2. SAME BREATH: Jira PUT to a THIRD value + a whole-plan rebuild
const [jiraRes, idxRes] = await Promise.all([
  put(`/rest/api/3/issue/${KEY}`, { fields: { duedate: "2026-12-04" } }).then(()=>"ok").catch(e=>String(e).slice(0,80)),
  rest(`resource=plans&id=${PLAN}&action=index`, { method: "POST" }).then(r=>r.status).catch(e=>String(e).slice(0,80)),
]);
console.log("jira PUT:", jiraRes, "index:", idxRes, "in", ((Date.now()-t0)/1000).toFixed(2), "s");
let seenAt = 0;
for (let i=0;i<150;i++){
  const ts = await f.evaluate(() => window.__toasts || []);
  if (ts.some(x => /after you had edited/.test(x.text) || /you had edited/.test(x.text))) { seenAt = Date.now(); break; }
  await page.waitForTimeout(1000);
}
const ts = await f.evaluate(() => window.__toasts || []);
console.log("TOASTS:", JSON.stringify(ts.map(x=>({dt:((x.t-t0)/1000).toFixed(1), text:x.text.replace(/\n/g,' ')}))));
console.log("editDrops toast after", seenAt ? ((seenAt-t0)/1000).toFixed(1)+"s" : "NEVER (150s)");
await shot(page, "6-editdrops");
const meta = await hook(`what=planMeta&planId=${PLAN}`);
console.log("meta.editDrops:", JSON.stringify(meta?.meta?.editDrops ?? meta?.editDrops ?? null));
console.log("row due now:", await dues());
// 3. reload — must NOT say it again
await page.reload({ waitUntil: "domcontentloaded" });
const f2 = await appFrame(page);
await openPlan(page, f2, P1_NAME);
await page.waitForTimeout(6000);
const after = await f2.locator('.toast-enter, .toast-exit, [role="status"], [role="alert"]').allInnerTexts().catch(()=>[]);
console.log("TOASTS AFTER RELOAD:", JSON.stringify(after));
await shot(page, "6-after-reload");
await ctx.close();
