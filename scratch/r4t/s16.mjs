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
  const before = await row.getAttribute("data-row-due");
  // the Finish column cell: find the cell whose text matches the current due
  const cells = await row.locator('> div').all();
  console.log(key, "cells:", (await Promise.all(cells.map(c=>c.innerText()))).map(t=>t.replace(/\n/g,"|")).join(" ~ "));
  return before;
}
console.log("R due:", await setDue("WFH-3684"));
console.log("T due:", await setDue("WFH-3699"));
await shot(page, "18-table");
await ctx.close();
