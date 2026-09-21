import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
import fs from "fs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await f.locator('button:has-text("Planning")').first().click();
await page.waitForTimeout(5000);
const bodyTxt = await f.locator('body').innerText();
console.log("PLANNING TABS:", bodyTxt.slice(0,600));
const tab = f.locator('button:has-text("Sponsor reports"), button:has-text("Reports")').first();
if (await tab.count()) { await tab.click(); await page.waitForTimeout(4000); }
await shot(page, "17-reports");
console.log("=== reports page ===");
console.log((await f.locator('body').innerText()).slice(0, 3000));
await ctx.close();
