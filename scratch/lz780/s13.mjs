// Items 4 + 5: publish, republish-unchanged, receipts and downloads
import { open, appFrame, shot, openPlan, APP, P2_NAME, SHOTS } from "./drive.mjs";
import fs from "fs";
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz780";
const SPACE = "LZ780 tester scratch";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P2_NAME);
await f.locator('button:has-text("Planning")').first().click(); await page.waitForTimeout(4000);
await f.locator('button:has-text("Sponsor reports")').first().click(); await page.waitForTimeout(4000);
const observe = () => f.evaluate(() => { window.__toasts = []; const seen = new Set();
  const scan = () => document.querySelectorAll('.toast-enter, .toast-exit, [role="status"], [role="alert"]').forEach((el) => {
    const t = el.innerText.trim(); if (t && !seen.has(t)) { seen.add(t); window.__toasts.push(t); } });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true }); scan(); });
const toasts = () => f.evaluate(() => window.__toasts || []);
async function pick(name) {
  await f.locator(`button:has-text("${name}"), [role="button"]:has-text("${name}")`).first().click().catch(async () => {
    await f.locator(`text=${name}`).first().click();
  });
  await page.waitForTimeout(4000);
}
async function receipt(tag) {
  const t = await f.locator('.lz-history-detail').innerText().catch(async () => (await f.locator('body').innerText()));
  fs.writeFileSync(`${OUT}/receipt-${tag}.txt`, t);
  console.log(`\n### RECEIPT ${tag} ###\n` + t.slice(0, 2600));
}
async function download(tag) {
  const [dl] = await Promise.all([ page.waitForEvent('download', { timeout: 60000 }),
    f.locator('button:has-text("Download")').first().click() ]);
  const p = `${OUT}/${tag}.html`; await dl.saveAs(p);
  console.log("DOWNLOADED", tag, fs.statSync(p).size, "bytes"); }
async function publish(tag) {
  await observe();
  const btn = f.locator('[data-testid="publish-to-confluence"]');
  if (!(await btn.count())) { console.log("PUBLISH BUTTON ABSENT for", tag, "— chip:", await f.locator('[data-testid="confluence-published-chip"]').innerText().catch(()=>"(none)")); return; }
  console.log("publish button:", JSON.stringify(await btn.innerText()));
  await btn.click();
  const dlg = f.locator('[data-testid="publish-confluence-dialog"]');
  await dlg.waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
  for (const t of await dlg.locator('button').all()) {
    const tx = (await t.innerText()).trim();
    if (/choose|space|select/i.test(tx)) { await t.click(); break; }
  }
  await page.waitForTimeout(1500);
  const opt = f.locator(`text=${SPACE}`).first();
  if (await opt.count()) await opt.click(); else console.log("SPACE OPTION NOT FOUND");
  await page.waitForTimeout(800);
  await shot(page, `pub-${tag}-dialog`);
  const t0 = Date.now();
  await dlg.locator('button').filter({ hasText: /^Publish|Update the page|Retry/ }).last().click();
  for (let i=0;i<90;i++){ await page.waitForTimeout(1000); if (!(await dlg.count())) break; }
  await page.waitForTimeout(2000);
  console.log(`PUBLISH ${tag} ${( (Date.now()-t0)/1000 ).toFixed(1)}s TOASTS:`, JSON.stringify(await toasts()));
  console.log("CHIP:", JSON.stringify(await f.locator('[data-testid="confluence-published-chip"]').innerText().catch(()=>"(none)")));
  const href = await f.locator('[data-testid="confluence-published-chip"] a, a[href*="/wiki/"]').first().getAttribute('href').catch(()=>null);
  console.log("PAGE LINK:", href);
  await shot(page, `pub-${tag}-after`);
}
await pick("LZ780 archive"); await receipt("archive"); await download("archive-download"); await publish("archive-1"); await publish("archive-2");
await pick("LZ780 storyline"); await receipt("storyline"); await download("storyline-download"); await publish("storyline-1"); await publish("storyline-2");
await ctx.close();
