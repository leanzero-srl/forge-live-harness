import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
await f.locator('[data-testid="derived-count-chip"]').first().click();
const d = f.locator('[data-testid="derived-review-dialog"]');
await d.waitFor({ timeout: 20000 });
const fin = () => d.locator('[data-testid="derived-review-finish"]').innerText();
const adoptLbl = () => d.locator('[data-testid="derived-review-adopt"]').innerText();
console.log("A default :", await fin(), "|", await adoptLbl());
// deselect T (WFH-3699)
const row = (k) => d.locator(`[data-testid="derived-review-row"][data-key="${k}"]`);
await row("WFH-3699").locator('input[type="checkbox"], [role="checkbox"]').first().click();
await page.waitForTimeout(500);
console.log("B minus T:", await fin(), "|", await adoptLbl());
// tick the past row
await d.locator('[data-testid="derived-review-past-toggle"]').click(); await page.waitForTimeout(400);
await row("WFH-3682").locator('input[type="checkbox"], [role="checkbox"]').first().click();
await page.waitForTimeout(500);
console.log("C +past  :", await fin(), "|", await adoptLbl());
await shot(page, "05-deselected");
// deselect everything in main list
await d.locator('[data-testid="derived-review-cancel"]').click();
await page.waitForTimeout(800);
console.log("dialog closed:", await d.count());
await ctx.close();
