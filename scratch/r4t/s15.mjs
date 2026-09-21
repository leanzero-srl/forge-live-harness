import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
import { publishTo } from "./pub.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await f.locator('button:has-text("Planning")').first().click(); await page.waitForTimeout(4000);
await f.locator('button:has-text("Sponsor reports")').first().click(); await page.waitForTimeout(4000);
await f.locator('button:has-text("r4t archive")').first().click(); await page.waitForTimeout(3500);
console.log("=== REPUBLISH ARCHIVE UNCHANGED ===");
await publishTo(page, f, "archive-again");
await ctx.close();
