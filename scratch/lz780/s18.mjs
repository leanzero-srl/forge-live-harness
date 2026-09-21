// Item 4b: a SAVED plan edit, then recapture
import { open, appFrame, shot, openPlan, APP, P2_NAME } from "./drive.mjs";
const KEY = "WFH-3723";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P2_NAME);
await f.locator('button:has-text("Table")').first().click(); await page.waitForTimeout(4000);
const row = f.locator(`[data-testid="table-row"][data-row-key="${KEY}"]`).first();
await row.scrollIntoViewIfNeeded();
console.log("before due:", await row.getAttribute("data-row-due"));
const cells = row.locator('> div'); const n = await cells.count();
for (let i=0;i<n;i++){ const t=(await cells.nth(i).innerText()).trim();
  if (/Oct 5/.test(t)) { await cells.nth(i).click(); console.log("clicked cell", i, JSON.stringify(t)); break; } }
await page.waitForTimeout(1200);
await f.locator('button[aria-label="2026-10-08"]').first().click();
await page.waitForTimeout(2000);
const save = f.locator('[data-testid="plan-save-btn"]');
console.log("save:", await save.innerText());
await save.click();
for (let i=0;i<60;i++){ if ((await save.getAttribute("data-save-state"))==="saved") break; await page.waitForTimeout(1000); }
console.log("save state:", await save.innerText(), await save.getAttribute("data-save-state"));
console.log("after due:", await row.getAttribute("data-row-due"));
await shot(page, "4b-saved-edit");
await ctx.close();
