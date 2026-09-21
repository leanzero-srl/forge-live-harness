// Item 1b: chip fits the toolbar at 1100 px; bulk bar counts; dialog subtitle
import { open, appFrame, shot, openPlan, APP, P1_NAME } from "./drive.mjs";
const { ctx, page } = await open({ width: 1100, height: 950 });
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P1_NAME);
await page.waitForTimeout(1500);
await shot(page, "1100-01-gantt");
const geo = await f.evaluate(() => {
  const chip = document.querySelector('[data-testid="derived-count-chip"]');
  if (!chip) return { chip: null };
  const cr = chip.getBoundingClientRect();
  const bar = chip.closest('.lz-plan-toolbar') || chip.parentElement.parentElement;
  const br = bar.getBoundingClientRect();
  const cs = getComputedStyle(chip);
  return {
    chipText: chip.innerText, chipRect: { x: cr.x, y: cr.y, w: cr.width, h: cr.height, right: cr.right, bottom: cr.bottom },
    barRect: { x: br.x, y: br.y, w: br.width, h: br.height, right: br.right, bottom: br.bottom },
    barClass: bar.className, overflowX: chip.scrollWidth > chip.clientWidth + 1,
    scrollW: chip.scrollWidth, clientW: chip.clientWidth, whiteSpace: cs.whiteSpace, textOverflow: cs.textOverflow,
    docW: document.documentElement.clientWidth,
  };
});
console.log("GEO", JSON.stringify(geo, null, 1));
await ctx.close();
