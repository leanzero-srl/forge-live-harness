import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await f.locator('button:has-text("Table")').first().click(); await page.waitForTimeout(4000);

async function setDue(key, iso) {
  const row = f.locator(`[data-testid="table-row"][data-row-key="${key}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.locator('> div').nth(4).click();       // Finish cell
  await page.waitForTimeout(900);
  const cal = f.locator('.lz-datepicker');
  for (let i=0;i<18;i++){
    if (await cal.locator(`[aria-label="${iso}"]`).count()) break;
    await cal.locator('[aria-label="Next month"]').click(); await page.waitForTimeout(350);
  }
  await cal.locator(`[aria-label="${iso}"]`).first().click();
  await page.waitForTimeout(1500);
  console.log("set", key, "->", iso, "row due now", await row.getAttribute("data-row-due"));
}
await setDue("WFH-3684", "2026-10-16");
await setDue("WFH-3699", "2026-11-20");
await page.waitForTimeout(2500);
const bodyTxt = await f.locator('body').innerText();
const m = bodyTxt.match(/Apply \d+ changes?/);
console.log("apply chip:", m && m[0]);
await shot(page, "19-staged");
await f.locator('button').filter({ hasText: /Apply \d+ change/ }).first().click();
await f.locator('[data-testid="apply-review-modal"]').waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
const mo = f.locator('[data-testid="apply-review-modal"]');
console.log("SUBTITLE:", await mo.locator('[data-testid="apply-review-subtitle"]').innerText());
console.log("DRIFT COUNT LINE:", await mo.locator('[data-testid="apply-plan-drift-count"]').innerText().catch(()=>"(none)"));
for (const r of await mo.locator('[data-testid="apply-change-row"]').all()) {
  const k = await r.getAttribute("data-issue-key");
  const drift = await r.locator('[data-testid="apply-plan-drift"]').innerText().catch(()=>null);
  console.log("ROW", k, "|", (await r.innerText()).replace(/\n/g," / "), "|| DRIFT:", drift);
}
await shot(page, "20-apply-review-drift");
await mo.locator('button:has-text("Discard All")').click();
await page.waitForTimeout(2500);
console.log("after Discard All, modal:", await f.locator('[data-testid="apply-review-modal"]').count());
const after = await f.locator('body').innerText();
console.log("apply chip after:", (after.match(/Apply \d+ changes?/)||["(none)"])[0]);
await shot(page, "21-after-discard");
await ctx.close();
