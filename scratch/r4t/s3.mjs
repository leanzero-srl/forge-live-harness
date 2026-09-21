import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
await f.locator('[data-testid="derived-count-chip"]').first().click();
await f.locator('[data-testid="derived-review-dialog"]').waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);
await shot(page, "03-review-collapsed");

const dump = async (tag) => {
  const d = f.locator('[data-testid="derived-review-dialog"]');
  console.log(`\n===== ${tag} =====`);
  console.log(await d.innerText());
  const rows = await d.locator('[data-testid="derived-review-row"]').all();
  for (const r of rows) {
    const key = await r.getAttribute("data-key"), sel = await r.getAttribute("data-selected");
    const delta = await r.locator('[data-testid="derived-review-delta"]').innerText().catch(()=>"");
    const wd = await r.locator('[data-testid="derived-review-delta"]').getAttribute("data-wd").catch(()=>"");
    const box = await r.locator('input[type="checkbox"], [role="checkbox"]').count();
    console.log(`ROW ${key} selected=${sel} delta="${delta}" wd=${wd} checkboxes=${box}`);
  }
  console.log("FINISH LINE:", await d.locator('[data-testid="derived-review-finish"]').innerText());
  console.log("ADOPT:", await d.locator('[data-testid="derived-review-adopt"]').innerText(), "disabled=", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
};
await dump("collapsed");

// expand all three groups one at a time (only one opens at a time)
for (const g of ["past","done","parents"]) {
  const t = f.locator(`[data-testid="derived-review-${g}-toggle"]`);
  if (await t.count()) { await t.click(); await page.waitForTimeout(700); await shot(page, `04-group-${g}`); await dump(`group ${g} open`); }
  else console.log("NO GROUP", g);
}
await ctx.close();
