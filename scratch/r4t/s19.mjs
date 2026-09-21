import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
import { rest } from "./rest.mjs";
const P = process.env.PLAN;
const { ctx, page } = await open();
const goPlan = async () => {
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  const f = await appFrame(page);
  for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
  await f.locator(`text=${PLAN_NAME}`).first().click();
  for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count() || (await f.locator('body').innerText()).includes("Apply ")) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(3500);
  return f;
};
let f = await goPlan();
await f.locator('[data-testid="derived-count-chip"]').first().click();
const d = f.locator('[data-testid="derived-review-dialog"]');
await d.waitFor({ timeout: 20000 }); await page.waitForTimeout(1000);
console.log("adopting:", await d.locator('[data-testid="derived-review-adopt"]').innerText());
await d.locator('[data-testid="derived-review-adopt"]').click();
await page.waitForTimeout(6000);
console.log("after adopt:", (await f.locator('body').innerText()).match(/Apply \d+ changes?/)?.[0]);
await shot(page, "22-after-adopt");
console.log("HOLIDAY:", (await rest(`resource=schedule&planId=${P}&action=holiday`, { method:"POST", body:{date:"2026-10-06",name:"r4t drift day"} })).status);
await page.waitForTimeout(3000);
f = await goPlan();   // reload so the client picks up the calendar
await page.waitForTimeout(4000);
const chip = (await f.locator('body').innerText()).match(/Apply \d+ changes?/)?.[0];
console.log("apply chip after reload:", chip);
await f.locator('button').filter({ hasText: /Apply \d+ change/ }).first().click();
const mo = f.locator('[data-testid="apply-review-modal"]');
await mo.waitFor({ timeout: 20000 }); await page.waitForTimeout(1500);
console.log("SUBTITLE:", await mo.locator('[data-testid="apply-review-subtitle"]').innerText());
console.log("DRIFT COUNT:", await mo.locator('[data-testid="apply-plan-drift-count"]').innerText().catch(()=>"(none)"));
for (const r of await mo.locator('[data-testid="apply-change-row"]').all()) {
  console.log("ROW", await r.getAttribute("data-issue-key"), "|", (await r.innerText()).replace(/\n/g," / "));
}
await shot(page, "23-apply-drift");
await mo.locator('button:has-text("Discard All")').click();
await page.waitForTimeout(3000);
console.log("modal after discard:", await mo.count(), "| chip:", (await f.locator('body').innerText()).match(/Apply \d+ changes?/)?.[0] || "(none)");
await shot(page, "24-after-discard");
await ctx.close();
