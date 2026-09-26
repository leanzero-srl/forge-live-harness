// LZ700 — connector-draw diagnostic + the real link draw A -> D.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

test("connector draw F", async ({ page }) => {
  const R: any = {};
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  const rf = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(16000);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  const stagedN = async () => { const t = await body(); const m = t.match(/Apply (\d+) change|Save \((\d+)\)/); return m ? Number(m[1] || m[2]) : 0; };
  const bars = async () => frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), start: e.getAttribute("data-bar-start"), due: e.getAttribute("data-bar-due"), derived: e.getAttribute("data-derived") })));
  const leftDots = async () => rf!.evaluate(() => Array.from(document.querySelectorAll('.conn-dot-left')).map((d: any) => ({
    key: d.closest('[data-key]')?.getAttribute('data-key'), op: getComputedStyle(d).opacity, pe: getComputedStyle(d).pointerEvents })));
  R.before = { staged: await stagedN(), bars: await bars() };

  const bar = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  const abox = (await bar(bed.a).boundingBox())!;
  await page.mouse.move(abox.x + abox.width / 2, abox.y + abox.height / 2, { steps: 6 });
  await page.waitForTimeout(1200);
  const dot = frame.locator(`[data-testid="gantt-bar"][data-key="${bed.a}"] .conn-dot-right`).first();
  const dbox = (await dot.boundingBox())!;
  const sx = dbox.x + dbox.width / 2, sy = dbox.y + dbox.height / 2;
  // dispatch a REAL bubbling mousedown on the dot (Forge iframe + hover-gated pointer-events
  // defeat a plain page.mouse.down at that coordinate)
  await dot.dispatchEvent("mousedown", { bubbles: true, clientX: Math.round(sx), clientY: Math.round(sy), button: 0 });
  await page.waitForTimeout(800);
  R.afterDown = await leftDots();
  console.log("LEFT DOTS AFTER MOUSEDOWN", JSON.stringify(R.afterDown));

  const tdot = frame.locator(`[data-testid="gantt-bar"][data-key="${bed.d}"] .conn-dot-left`).first();
  const tb = (await tdot.boundingBox())!;
  const tx = tb.x + tb.width / 2, ty = tb.y + tb.height / 2;
  R.hitSource = await rf!.evaluate(([x, y]: any) => { const e: any = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className}` : null; }, [Math.round(sx), Math.round(sy)]);
  R.hitTarget = await rf!.evaluate(([x, y]: any) => { const e: any = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className}` : null; }, [Math.round(tx), Math.round(ty)]);
  console.log("HIT", R.hitSource, "|", R.hitTarget);
  await page.mouse.move(sx, sy, { steps: 2 });
  for (const f of [0.3, 0.6, 0.85, 1]) await page.mouse.move(sx + (tx - sx) * f, sy + (ty - sy) * f, { steps: 10 });
  await page.waitForTimeout(900);
  // belt and braces: fire the React onMouseEnter the drop target listens for
  await tdot.dispatchEvent("mouseover", { bubbles: true, clientX: Math.round(tx), clientY: Math.round(ty) });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/f01-drawing.png` });
  await page.mouse.up();
  await page.waitForTimeout(8000);
  R.after = { staged: await stagedN(), bars: await bars() };
  console.log("AFTER", JSON.stringify(R.after));
  await page.screenshot({ path: `${OUT}/f02-after.png` });
  const ab = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
  if (await ab.count()) {
    await ab.dispatchEvent("click"); await page.waitForTimeout(4000);
    R.review = (await frame.locator('[data-testid="apply-review-modal"]').innerText().catch(() => "(none)")).replace(/\s+/g, " ").slice(0, 1200);
    console.log("REVIEW", R.review);
    await page.screenshot({ path: `${OUT}/f03-review.png` });
  }
  fs.writeFileSync(`${OUT}/f-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
