import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await f.locator('button:has-text("Dashboard")').first().click();
await page.waitForTimeout(6000);
await shot(page, "16-dashboard");
for (const id of ["plan-health-punchline","plan-health-commitment"]) {
  const l = f.locator(`[data-testid="${id}"]`);
  console.log(id, "=>", JSON.stringify(await l.innerText().catch(()=>"(missing)")));
}
const hero = await f.locator('.lz-dash-hero, section').first().innerText().catch(()=>"");
console.log("--- hero block ---\n"+hero.slice(0,900));
await ctx.close();
