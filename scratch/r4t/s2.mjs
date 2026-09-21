import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
await shot(page, "02-plan-open");
const chip = f.locator('[data-testid="derived-count-chip"]').first();
console.log("CHIP text:", JSON.stringify(await chip.innerText()), "data-count:", await chip.getAttribute("data-count"));
const body = await f.locator('body').innerText();
console.log("DERIVED badges on surface:", (body.match(/DERIVED/g)||[]).length);
console.log("--- toolbar area ---");
console.log(body.slice(0, 2500));
await ctx.close();
