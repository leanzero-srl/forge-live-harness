import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
import { rest } from "./rest.mjs";
const P = process.env.PLAN;
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
await page.waitForTimeout(1000);
const rowText = async () => {
  const out = {};
  for (const k of ["WFH-3678","WFH-3679","WFH-3699","WFH-3700"]) {
    out[k] = await d.locator(`[data-testid="derived-review-row"][data-key="${k}"] [data-testid="derived-review-schedule"]`).innerText().catch(()=>"-");
  }
  return out;
};
console.log("BEFORE rows:", JSON.stringify(await rowText()));
console.log("BEFORE finish:", await d.locator('[data-testid="derived-review-finish"]').innerText());
console.log("BEFORE adopt disabled:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
await shot(page, "10-f16-before");

const t0 = Date.now();
const r = await rest(`resource=schedule&planId=${P}&action=holiday`, { method: "POST", body: { date: "2026-10-06", name: "r4t second shutdown" } });
console.log("HOLIDAY POSTED", r.status, JSON.stringify(r.schedule?.holidays||r).slice(0,200), "at t+0");
let movedAt = null, rowsChangedAt = null;
const before = JSON.stringify(await rowText());
for (let i = 0; i < 150; i++) {              // up to ~150 s
  await page.waitForTimeout(1000);
  const has = await d.locator('[data-testid="derived-review-moved"]').count();
  const now = JSON.stringify(await rowText());
  if (!rowsChangedAt && now !== before) { rowsChangedAt = ((Date.now()-t0)/1000).toFixed(1); console.log("ROWS RE-DERIVED at t+"+rowsChangedAt+"s ->", now); }
  if (!movedAt && has) { movedAt = ((Date.now()-t0)/1000).toFixed(1); console.log("AMBER BLOCK at t+"+movedAt+"s"); }
  if (movedAt && rowsChangedAt) break;
}
console.log("RESULT movedAt=", movedAt, "rowsChangedAt=", rowsChangedAt);
if (movedAt) {
  console.log("AMBER TEXT:", await d.locator('[data-testid="derived-review-moved"]').innerText());
  console.log("adopt disabled while amber:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
  await shot(page, "11-f16-amber");
  await d.locator('[data-testid="derived-review-moved"] button').click();
  await page.waitForTimeout(800);
  console.log("after ack, amber:", await d.locator('[data-testid="derived-review-moved"]').count(), "adopt disabled:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
  console.log("AFTER rows:", JSON.stringify(await rowText()));
  console.log("AFTER finish:", await d.locator('[data-testid="derived-review-finish"]').innerText());
  await shot(page, "12-f16-after-ack");
} else {
  await shot(page, "11-f16-NO-amber");
  console.log("DIALOG TEXT:\n"+await d.innerText());
}
await ctx.close();
