// LZ700 — Discard All through the review modal, then draw a link OUT OF a derived predecessor.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

test("discard all then link draw", async ({ page }) => {
  const R: any = { steps: [] };
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(16000);
  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  const stagedN = async () => { const t = await body(); const m = t.match(/Apply (\d+) change|Save \((\d+)\)/); return m ? Number(m[1] || m[2]) : 0; };
  const bars = async () => frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), start: e.getAttribute("data-bar-start"), due: e.getAttribute("data-bar-due"), derived: e.getAttribute("data-derived") })));
  const chips = async () => frame.locator('[data-testid="gantt-derived-chip"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key")));
  const bar = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  R.steps.push({ step: "c0-reload", stagedN: await stagedN(), bars: await bars(), chips: await chips() });
  console.log("C0 (draft survived reload?)", JSON.stringify(R.steps.at(-1)));

  // ---- Discard All through the review modal
  const applyBtn = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
  if (await applyBtn.count()) {
    await applyBtn.dispatchEvent("click"); await page.waitForTimeout(4000);
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/c01-discard-confirm.png` });
    const confirm = frame.locator("button").filter({ hasText: /^(Discard|Discard All|Discard changes|Yes)/ }).last();
    if (await confirm.count()) { await confirm.dispatchEvent("click"); await page.waitForTimeout(6000); }
  }
  await page.waitForTimeout(4000);
  R.steps.push({ step: "c1-after-discard-all", stagedN: await stagedN(), bars: await bars(), chips: await chips() });
  console.log("C1", JSON.stringify(R.steps.at(-1)));
  await page.screenshot({ path: `${OUT}/c02-after-discard.png` });

  // ---- Link draw A -> D, driven from the REAL connector dot
  const abox = (await bar(bed.a).boundingBox())!;
  await page.mouse.move(abox.x + abox.width / 2, abox.y + abox.height / 2, { steps: 8 });
  await page.waitForTimeout(1500);
  const dot = frame.locator(`[data-testid="gantt-bar"][data-key="${bed.a}"] .conn-dot-right`).first();
  R.dotVisible = await dot.isVisible().catch(() => false);
  const dbox = await dot.boundingBox();
  R.dotBox = dbox;
  console.log("DOT", R.dotVisible, JSON.stringify(dbox));
  await page.screenshot({ path: `${OUT}/c03-hover-a.png` });
  if (dbox) {
    const sx = dbox.x + dbox.width / 2, sy = dbox.y + dbox.height / 2;
    await page.mouse.move(sx, sy, { steps: 4 });
    await page.waitForTimeout(400);
    await page.mouse.down();
    const tbox = (await bar(bed.d).boundingBox())!;
    const tx = tbox.x + tbox.width / 2, ty = tbox.y + tbox.height / 2;
    for (const f of [0.25, 0.5, 0.75, 0.95, 1]) await page.mouse.move(sx + (tx - sx) * f, sy + (ty - sy) * f, { steps: 8 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/c04-drawing.png` });
    await page.mouse.up();
    await page.waitForTimeout(8000);
  }
  R.steps.push({ step: "c2-link-drawn", stagedN: await stagedN(), bars: await bars(), chips: await chips(), body: (await body()).replace(/\s+/g, " ").slice(0, 400) });
  console.log("C2", JSON.stringify(R.steps.at(-1)));
  await page.screenshot({ path: `${OUT}/c05-after-link.png` });
  const ab = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
  if (await ab.count()) {
    await ab.dispatchEvent("click"); await page.waitForTimeout(4000);
    R.linkReview = (await frame.locator('[data-testid="apply-review-modal"]').innerText().catch(() => "(none)")).replace(/\s+/g, " ").slice(0, 1200);
    console.log("LINK REVIEW", R.linkReview);
    await page.screenshot({ path: `${OUT}/c06-link-review.png` });
  }
  fs.writeFileSync(`${OUT}/c-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
