import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
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

async function pick(name) {
  await f.locator(`nav button:has-text("${name}"), button:has-text("${name}")`).first().click();
  await page.waitForTimeout(3500);
}
async function receipt(tag) {
  const detail = await f.locator('.lz-history-detail').innerText();
  console.log(`\n### RECEIPT ${tag} ###\n` + detail.slice(0, 2200));
}
async function download(tag) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    f.locator('button:has-text("Download")').first().click(),
  ]);
  const p = `${OUT}/${tag}.html`;
  await dl.saveAs(p);
  console.log("DOWNLOADED", tag, fs.statSync(p).size, "bytes");
  return p;
}
async function publish(tag, expectRepublish=false) {
  const btn = f.locator('[data-testid="publish-to-confluence"]');
  console.log("publish button label:", await btn.innerText());
  await btn.click();
  await f.locator('[data-testid="publish-confluence-dialog"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot(page, `pub-${tag}-dialog`);
  // choose LZC4 in the custom Select
  const sel = f.locator('[data-testid="publish-confluence-dialog"] button').filter({ hasText: /space|Choose|Select/i }).first();
  const dlg = f.locator('[data-testid="publish-confluence-dialog"]');
  console.log("dialog text:", (await dlg.innerText()).slice(0,500));
  // open the Select trigger (first button in the dialog body that is not close/cancel/publish)
  const triggers = await dlg.locator('button').all();
  for (const t of triggers) {
    const tx = (await t.innerText()).trim();
    if (/choose|space|select/i.test(tx)) { await t.click(); break; }
  }
  await page.waitForTimeout(1500);
  const opt = f.locator('text=LZC4 tester scratch').first();
  console.log("LZC4 option count:", await opt.count());
  await opt.click();
  await page.waitForTimeout(800);
  await shot(page, `pub-${tag}-chosen`);
  const t0 = Date.now();
  await dlg.locator('button').filter({ hasText: /^Publish|Update the page|Retry/ }).last().click();
  for (let i=0;i<60;i++){ await page.waitForTimeout(1000); if (!(await f.locator('[data-testid="publish-confluence-dialog"]').count())) break; }
  await page.waitForTimeout(1500);
  const toasts = await f.locator('[class*="toast"], [role="status"], [role="alert"]').allInnerTexts().catch(()=>[]);
  console.log(`PUBLISH ${tag} took ${((Date.now()-t0)/1000).toFixed(1)}s TOASTS:`, JSON.stringify(toasts));
  await shot(page, `pub-${tag}-after`);
  const chip = f.locator('[data-testid="confluence-published-chip"]');
  console.log("CHIP:", await chip.innerText().catch(()=>"(none)"));
}

await pick("r4t archive"); await receipt("archive"); await download("archive-download"); await publish("archive");
await pick("r4t storyline"); await receipt("storyline"); await download("storyline-download"); await publish("storyline");
// republish the SAME storyline report, unchanged
await page.waitForTimeout(1500);
await publish("storyline-again", true);
await ctx.close();
