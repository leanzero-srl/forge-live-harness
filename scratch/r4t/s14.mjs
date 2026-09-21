import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
import { publishTo } from "./pub.mjs";
import fs from "fs";
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/r4t";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await f.locator('button:has-text("Planning")').first().click(); await page.waitForTimeout(4000);
await f.locator('button:has-text("Sponsor reports")').first().click(); await page.waitForTimeout(4000);
await f.locator('button:has-text("r4t storyline")').first().click(); await page.waitForTimeout(3500);
console.log("### RECEIPT storyline ###\n"+(await f.locator('.lz-history-detail').innerText()).slice(0,1800));
const [dl] = await Promise.all([ page.waitForEvent('download',{timeout:60000}), f.locator('button:has-text("Download")').first().click() ]);
await dl.saveAs(`${OUT}/storyline-download.html`);
console.log("DOWNLOADED", fs.statSync(`${OUT}/storyline-download.html`).size);
await publishTo(page, f, "storyline");
await page.waitForTimeout(2000);
console.log("=== REPUBLISH UNCHANGED ===");
await publishTo(page, f, "storyline-again");
await ctx.close();
