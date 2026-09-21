import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
// row menu on the DONE derived row WFH-3680
const chip = f.locator('[data-testid="gantt-derived-chip"][data-key="WFH-3680"]').first();
console.log("done-row chip count:", await chip.count());
await chip.scrollIntoViewIfNeeded();
await chip.dispatchEvent('click');
await page.waitForTimeout(900);
const menu = f.locator('[data-testid="derived-row-menu"]');
console.log("menu:", await menu.count(), await menu.innerText().catch(()=>"-"));
await shot(page, "06-done-row-menu");
await f.locator('[data-testid="derived-menu-adopt"]').dispatchEvent('click');
await page.waitForTimeout(1500);
const d = f.locator('[data-testid="derived-review-dialog"]');
console.log("dialog open:", await d.count());
if (await d.count()) {
  console.log(await d.innerText());
  console.log("ADOPT disabled:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled(), "|", await d.locator('[data-testid="derived-review-adopt"]').innerText());
  await shot(page, "07-done-row-scoped-review");
}
const toasts = await f.locator('[role="status"], .lz-toast, [class*="toast"]').allInnerTexts().catch(()=>[]);
console.log("TOASTS:", JSON.stringify(toasts));
await ctx.close();
