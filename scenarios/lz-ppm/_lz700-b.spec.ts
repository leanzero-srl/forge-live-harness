// LZ700 item 1 part 2 — accepted due-extension, link draw out of a derived predecessor,
// holiday REMOVE while open.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

test("accepted extension, link draw, holiday remove", async ({ page }) => {
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
  const toGantt = async () => { await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {}); await page.waitForTimeout(7000); };
  await toGantt();
  R.steps.push({ step: "b0", bars: await bars(), chips: await chips(), stagedN: await stagedN() });
  console.log("B0", JSON.stringify(R.steps.at(-1)));

  // ---- 1d ACCEPTED due-extension of C: grab the RIGHT edge and pull +2 calendar days
  const cbox = (await bar(bed.c).boundingBox())!;
  const pxPerDay = cbox.width / 2;                       // C spans exactly 2 calendar days
  const gx = cbox.x + cbox.width - 2, gy = cbox.y + cbox.height / 2;
  await page.mouse.move(gx, gy); await page.mouse.down();
  for (const f of [0.3, 0.6, 1]) await page.mouse.move(gx + 2 * pxPerDay * f, gy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(5000);
  const ext = { step: "1d-extend-C", pxPerDay, stagedN: await stagedN(), bars: await bars(), chips: await chips() };
  R.steps.push(ext); console.log("EXTEND", JSON.stringify(ext));
  await page.screenshot({ path: `${OUT}/b01-extend-c.png` });
  // what exactly is staged?
  const applyBtn = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
  if (await applyBtn.count()) {
    await applyBtn.dispatchEvent("click"); await page.waitForTimeout(4000);
    R.applyReview = (await frame.locator('[data-testid="apply-review-modal"]').innerText().catch(() => "(none)")).replace(/\s+/g, " ").slice(0, 1200);
    console.log("APPLY REVIEW", R.applyReview);
    await page.screenshot({ path: `${OUT}/b02-apply-review.png` });
    await frame.getByRole("button", { name: /Cancel|Close/i }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
  }
  // discard
  for (let i = 0; i < 3; i++) {
    const d = frame.locator("button").filter({ hasText: /^Discard/ }).first();
    if (!(await d.count())) break;
    await d.dispatchEvent("click"); await page.waitForTimeout(2500);
    const conf = frame.locator("button").filter({ hasText: /^(Discard|Discard all|Yes|Confirm)/ }).last();
    if (await conf.count()) { await conf.dispatchEvent("click"); await page.waitForTimeout(4000); }
    if ((await stagedN()) === 0) break;
  }
  R.steps.push({ step: "1d-after-discard", stagedN: await stagedN(), bars: await bars() });
  console.log("AFTER DISCARD", JSON.stringify(R.steps.at(-1)));

  // ---- 1e LINK DRAW out of the derived predecessor A -> D
  const abox = (await bar(bed.a).boundingBox())!;
  await page.mouse.move(abox.x + abox.width / 2, abox.y + abox.height / 2);
  await page.waitForTimeout(1200);
  const dot = frame.locator(`[data-testid="gantt-bar"][data-key="${bed.a}"] .conn-dot-right`).first();
  const dbox = (await dot.boundingBox().catch(() => null)) || { x: abox.x + abox.width, y: abox.y + abox.height / 2, width: 8, height: 8 };
  await page.mouse.move(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2);
  await page.mouse.down();
  const tbox = (await bar(bed.d).boundingBox())!;
  for (const f of [0.3, 0.6, 1]) await page.mouse.move(dbox.x + (tbox.x + tbox.width / 2 - dbox.x) * f, dbox.y + (tbox.y + tbox.height / 2 - dbox.y) * f, { steps: 8 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(6000);
  const link = { step: "1e-link-A-to-D", stagedN: await stagedN(), bars: await bars(), chips: await chips() };
  R.steps.push(link); console.log("LINK", JSON.stringify(link));
  await page.screenshot({ path: `${OUT}/b03-link-drawn.png` });

  fs.writeFileSync(`${OUT}/b-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
