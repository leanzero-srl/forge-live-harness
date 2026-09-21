import { open, appFrame, openPlan, APP, P2_NAME } from "./drive.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P2_NAME);
await f.locator('button:has-text("Planning")').first().click(); await page.waitForTimeout(4000);
await f.locator('button:has-text("Sponsor reports")').first().click(); await page.waitForTimeout(4000);
const els = await f.evaluate(() => [...document.querySelectorAll('button, li, [role="button"]')]
  .filter(e => /LZ780 (archive|storyline)/.test(e.innerText||''))
  .map(e => ({ tag: e.tagName, cls: e.className, testid: e.getAttribute('data-testid'), text: (e.innerText||'').replace(/\n/g,' | ').slice(0,120) })));
console.log(JSON.stringify(els, null, 1));
await ctx.close();
