import fs from "fs";
export const SPACE = "LZ780 tester scratch";
export const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz780";
export async function observe(f) { await f.evaluate(() => { window.__toasts = []; const seen = new Set();
  const scan = () => document.querySelectorAll('.toast-enter, .toast-exit, [role="status"], [role="alert"]').forEach((el) => {
    const t = el.innerText.trim(); if (t && !seen.has(t)) { seen.add(t); window.__toasts.push(t); } });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true }); scan(); }); }
export const toasts = (f) => f.evaluate(() => window.__toasts || []);
export async function pick(page, f, name) {
  await f.locator('button.lz-history-item').filter({ hasText: name }).first().click();
  await page.waitForTimeout(4500);
}
export async function receipt(page, f, tag) {
  const t = await f.locator('.lz-history-detail').innerText().catch(async () => (await f.locator('body').innerText()));
  fs.writeFileSync(`${OUT}/receipt-${tag}.txt`, t);
  console.log(`\n### RECEIPT ${tag} (${t.length} chars) ###\n` + t.slice(0, 3000));
}
export async function download(page, f, tag) {
  const [dl] = await Promise.all([ page.waitForEvent('download', { timeout: 60000 }),
    f.locator('button:has-text("Download")').first().click() ]);
  const p = `${OUT}/${tag}.html`; await dl.saveAs(p);
  console.log("DOWNLOADED", tag, fs.statSync(p).size, "bytes"); return p; }
export async function publish(page, f, tag, shot) {
  await observe(f);
  const btn = f.locator('[data-testid="publish-to-confluence"]');
  if (!(await btn.count())) { console.log("NO PUBLISH BUTTON", tag); return; }
  console.log(`\n--- publish ${tag}; button: ${JSON.stringify(await btn.innerText())}`);
  await btn.click();
  const dlg = f.locator('[data-testid="publish-confluence-dialog"]');
  await dlg.waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
  let text = await dlg.innerText();
  if (!text.includes(SPACE)) {
    for (const t of await dlg.locator('button').all()) {
      const tx = (await t.innerText()).trim();
      if (/choose|space|select/i.test(tx)) { await t.click(); break; } }
    await page.waitForTimeout(1500);
    const opt = f.locator(`[role="option"]`).filter({ hasText: SPACE }).first();
    if (await opt.count()) await opt.dispatchEvent('click'); else console.log("SPACE OPTION MISSING");
    await page.waitForTimeout(1200);
  }
  await page.keyboard.press('Escape').catch(()=>{});
  await page.waitForTimeout(500);
  if (!(await dlg.count())) { console.log("dialog closed by Escape — reopening"); await btn.click(); await dlg.waitFor({timeout:20000}); await page.waitForTimeout(2000); }
  console.log("dialog:", JSON.stringify((await dlg.innerText()).replace(/\n/g,' | ').slice(0,400)));
  if (shot) await shot(page, `pub-${tag}-dialog`);
  const t0 = Date.now();
  const act = dlg.locator('button').filter({ hasText: /^(Publish|Update the page|Retry)/ }).last();
  await act.dispatchEvent('click');
  for (let i=0;i<90;i++){ await page.waitForTimeout(1000); if (!(await dlg.count())) break; }
  await page.waitForTimeout(2500);
  console.log(`PUBLISH ${tag} ${((Date.now()-t0)/1000).toFixed(1)}s TOASTS:`, JSON.stringify(await toasts(f)));
  console.log("CHIP:", JSON.stringify(await f.locator('[data-testid="confluence-published-chip"]').innerText().catch(()=>"(none)")));
  const href = await f.locator('a[href*="/wiki/"]').first().getAttribute('href').catch(()=>null);
  console.log("PAGE LINK:", href);
  if (shot) await shot(page, `pub-${tag}-after`);
  return href;
}
