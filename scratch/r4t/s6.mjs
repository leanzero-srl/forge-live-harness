import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await f.locator('button:has-text("Table")').first().click();
await page.waitForTimeout(4000);
const row = f.locator('[data-testid="table-row"][data-row-key="WFH-3680"]');
console.log("row:", await row.count());
await row.scrollIntoViewIfNeeded();
const cb = row.locator('input[type="checkbox"], [role="checkbox"]').first();
await cb.dispatchEvent('click');
await page.waitForTimeout(900);
const bulk = f.locator('[data-testid="bulk-adopt-derived"]');
console.log("bulk button:", await bulk.count(), await bulk.innerText().catch(()=>"-"));
await shot(page, "08-bulk-bar-done-only");
if (await bulk.count()) {
  await bulk.dispatchEvent('click');
  await page.waitForTimeout(1600);
  const d = f.locator('[data-testid="derived-review-dialog"]');
  console.log("dialog:", await d.count());
  if (await d.count()) { console.log(await d.innerText()); console.log("adopt disabled:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled()); await shot(page,"09-bulk-done-review"); }
}
await ctx.close();
