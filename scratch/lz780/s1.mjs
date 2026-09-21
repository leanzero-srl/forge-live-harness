// Item 1a: chip text + badge count + tip on P1 (1 parent rollup)
import { open, appFrame, shot, openPlan, header, APP, P1_NAME } from "./drive.mjs";
const NAME = process.env.PLAN_NAME || P1_NAME;
const TAG = process.env.TAG || "p1";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
console.log("HEADER:", await header(f));
await openPlan(page, f, NAME);
await shot(page, `${TAG}-01-gantt`);
const chip = f.locator('[data-testid="derived-count-chip"]');
console.log("CHIP TEXT:", JSON.stringify(await chip.innerText().catch(()=>"(none)")));
console.log("CHIP data-count:", await chip.getAttribute("data-count").catch(()=>null));
// DERIVED badges on the Gantt sidebar
const badges = await f.locator('text=Derived').count();
const badgeKeys = await f.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.children.length === 0 && el.textContent.trim() === 'Derived') {
      let p = el, key = null;
      for (let i=0;i<12 && p;i++){ key = p.getAttribute && (p.getAttribute('data-key')||p.getAttribute('data-row-key')); if (key) break; p = p.parentElement; }
      out.push(key || '(no key)');
    }
  });
  return out;
});
console.log("DERIVED badge count:", badges, "keys:", JSON.stringify(badgeKeys));
// tooltip
await chip.hover().catch(()=>{});
const box = await chip.boundingBox();
if (box) { await page.mouse.move(box.x + box.width/2, box.y + box.height/2); }
await page.waitForTimeout(1200);
const tips = await f.locator('[role="tooltip"], .lz-tooltip, [class*="tooltip"]').allInnerTexts().catch(()=>[]);
console.log("TIP:", JSON.stringify(tips));
await shot(page, `${TAG}-02-chip-tip`);
await ctx.close();
