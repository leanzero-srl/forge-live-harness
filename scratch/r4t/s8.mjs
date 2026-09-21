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
const rowB = () => d.locator('[data-testid="derived-review-row"][data-key="WFH-3678"] [data-testid="derived-review-schedule"]').innerText();
console.log("fresh open (2 holidays) B =", await rowB());   // should be Oct 2 - Oct 9

// now REMOVE the second holiday while open
const t0 = Date.now();
const r = await rest(`resource=schedule&planId=${P}&action=holiday`, { method: "DELETE", body: { date: "2026-10-06" } });
console.log("HOLIDAY REMOVED", r.status, JSON.stringify(r.schedule?.holidays||r).slice(0,200));
const check = async (label) => console.log(label, "t+"+((Date.now()-t0)/1000).toFixed(1)+"s B=", await rowB(), "amber=", await d.locator('[data-testid="derived-review-moved"]').count());
await page.waitForTimeout(15000); await check("idle 15s  ");
// trigger 1: blur + focus the top page
await page.evaluate(() => { window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(2000);
await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(6000); await check("after focus");
// trigger 2: real mouse activity inside the frame
const box = await d.boundingBox(); if (box) { await page.mouse.move(box.x+box.width/2, box.y+40); await page.mouse.move(box.x+box.width/2, box.y+80); }
await page.waitForTimeout(6000); await check("after mouse");
// trigger 3: open a second tab and come back (real visibility change)
const p2 = await ctx.newPage(); await p2.goto("https://example.com"); await p2.waitForTimeout(3000); await p2.close();
await page.bringToFront();
await page.waitForTimeout(8000); await check("after tab ");
await page.waitForTimeout(40000); await check("idle 70s  ");
await shot(page, "13-f16-remove");
await ctx.close();
