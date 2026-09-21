import { shot } from "./drive.mjs";
export async function publishTo(page, f, tag) {
  const btn = f.locator('[data-testid="publish-to-confluence"]');
  const label = await btn.innerText();
  console.log("publish button label:", JSON.stringify(label));
  await btn.click();
  const dlg = f.locator('[data-testid="publish-confluence-dialog"]');
  await dlg.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  const dtxt = await dlg.innerText();
  if (!/LZC4/.test(dtxt)) {
    for (const t of await dlg.locator('button').all()) {
      const tx = (await t.innerText()).trim();
      if (/choose a space|space/i.test(tx) && !/^Publish|^Cancel/.test(tx)) { await t.dispatchEvent('click'); break; }
    }
    await page.waitForTimeout(1200);
    await f.locator('[role="option"]').filter({ hasText: 'LZC4' }).first().dispatchEvent('click');
    await page.waitForTimeout(1200);
  } else console.log("space already LZC4");
  await shot(page, `pub-${tag}-chosen`);
  const t0 = Date.now();
  const go = dlg.locator('button.lz-btn-primary').last();
  console.log("primary button:", await go.innerText());
  await go.dispatchEvent('click');
  for (let i=0;i<90;i++){ await page.waitForTimeout(1000); if (!(await f.locator('[data-testid="publish-confluence-dialog"]').count())) break; }
  const toasts = await f.locator('[class*="toast"], [role="status"], [role="alert"]').allInnerTexts().catch(()=>[]);
  console.log(`PUBLISH ${tag} ${((Date.now()-t0)/1000).toFixed(1)}s TOASTS:`, JSON.stringify(toasts));
  await shot(page, `pub-${tag}-after`);
  await page.waitForTimeout(1200);
  console.log("CHIP:", await f.locator('[data-testid="confluence-published-chip"]').innerText().catch(()=>"(none)"));
}
