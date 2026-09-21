// Item 6 retry: the rebuild must WIN the race — refreshPlan runs inline in the webtrigger
import { open, appFrame, shot, openPlan, APP, P1_NAME } from "./drive.mjs";
import { hook } from "./rest.mjs";
import { put } from "../../data/jira.mjs";
const PLAN = process.env.PLAN_ID, KEY = "WFH-3714";
// bed hygiene first
console.log("clearDrafts:", JSON.stringify(await hook(`what=clearDrafts&planId=${PLAN}`)).slice(0,120));
await put(`/rest/api/3/issue/${KEY}`, { fields: { duedate: "2026-10-23" } });
console.log("jira due restored to 2026-10-23");
console.log("refresh:", (await hook(`what=refreshPlan&planId=${PLAN}`)).ok);
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P1_NAME);
await f.locator('button:has-text("Table")').first().click(); await page.waitForTimeout(3500);
await f.evaluate(() => { window.__toasts = []; const seen = new Set();
  const scan = () => document.querySelectorAll('.toast-enter, .toast-exit, [role="status"], [role="alert"]').forEach((el) => {
    const t = el.innerText.trim(); if (t && !seen.has(t)) { seen.add(t); window.__toasts.push({ t: Date.now(), text: t }); } });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true }); scan(); });
console.log("row due before:", await f.locator(`[data-testid="table-row"][data-row-key="${KEY}"]`).getAttribute("data-row-due"));
const ae = await hook(`what=applyEdit&planId=${PLAN}&key=${KEY}&field=dueDate&value=2026-11-06`);
console.log("applyEdit:", JSON.stringify(ae).slice(0,150));
const t0 = Date.now();
const [j, r] = await Promise.all([
  put(`/rest/api/3/issue/${KEY}`, { fields: { duedate: "2026-12-04" } }).then(()=>"ok").catch(e=>String(e).slice(0,60)),
  hook(`what=refreshPlan&planId=${PLAN}`).then(x=>JSON.stringify(x).slice(0,80)),
]);
console.log("jira:", j, "refresh:", r, "in", ((Date.now()-t0)/1000).toFixed(2),"s");
let seenAt = 0;
for (let i=0;i<90;i++){
  const ts = await f.evaluate(() => window.__toasts || []);
  if (ts.some(x => /you had edited/.test(x.text))) { seenAt = Date.now(); break; }
  await page.waitForTimeout(1000);
}
const ts = await f.evaluate(() => window.__toasts || []);
console.log("TOASTS:", JSON.stringify(ts.map(x=>({dt:((x.t-t0)/1000).toFixed(1), text:x.text.replace(/\n/g,' ')}))));
console.log("editDrops toast:", seenAt ? ((seenAt-t0)/1000).toFixed(1)+"s" : "NEVER (90s)");
const meta = await hook(`what=planMeta&planId=${PLAN}`);
console.log("meta.editDrops:", JSON.stringify((meta.meta||meta).editDrops));
await shot(page, "6b-editdrops");
// count occurrences of the notice
const n = ts.filter(x=>/you had edited/.test(x.text)).length;
console.log("notice occurrences:", n);
await page.reload({ waitUntil: "domcontentloaded" });
const f2 = await appFrame(page); await openPlan(page, f2, P1_NAME);
await page.waitForTimeout(8000);
const after = await f2.locator('.toast-enter, .toast-exit, [role="status"], [role="alert"]').allInnerTexts().catch(()=>[]);
console.log("AFTER RELOAD:", JSON.stringify(after));
await shot(page, "6b-after-reload");
await ctx.close();
