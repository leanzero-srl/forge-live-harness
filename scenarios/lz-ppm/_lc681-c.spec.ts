// LIVE CHECK dev 6.81.0 — DIAGNOSTIC for item 2 (why the derived drag did not move)
// + ITEM 3 (baseline on the untouched lagged plan).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "Derived Lag Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("drag diagnostic + baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const f0 = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  const f: any = f0;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(16000);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);

  const R: any = {};
  const barOf = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  const readBars = async () => {
    const o: any = {};
    for (const b of await frame.locator('[data-testid="gantt-bar"]').all())
      o[(await b.getAttribute("data-key"))!] = { start: await b.getAttribute("data-bar-start"), due: await b.getAttribute("data-bar-due"), derived: await b.getAttribute("data-derived") };
    return o;
  };
  const bodyHas = async () => (await txt(frame.locator("body"))).replace(/\s+/g, " ");

  // ---------- A: drag the FREE HEAD WFH-3466 right 7 days (drag mechanics control) ----------
  const b1 = (await barOf("WFH-3466").boundingBox())!;
  const ppd = b1.width / 5;
  let cx = b1.x + b1.width / 2, cy = b1.y + b1.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const fr of [0.3, 0.6, 1]) await page.mouse.move(cx + ppd * 7 * fr, cy, { steps: 5 });
  await page.waitForTimeout(800);
  R.headDragLabel = await f.evaluate(() => {
    const t = document.body.innerText || "";
    const m = t.match(/2026-\d\d-\d\d\s*[→\-–]\s*2026-\d\d-\d\d/g);
    return m ? m.slice(0, 5) : [];
  });
  await page.screenshot({ path: `${OUT}/c01-mid-drag-head.png` });
  await page.mouse.up();
  await page.waitForTimeout(4000);
  R.afterHeadDrag = await readBars();
  R.headToolbar = (await bodyHas()).match(/Apply \d+ changes?|Save \(\d+\)/g) || [];
  console.log("HEAD DRAG LABEL", JSON.stringify(R.headDragLabel));
  console.log("AFTER HEAD DRAG", JSON.stringify(R.afterHeadDrag), R.headToolbar);
  await page.screenshot({ path: `${OUT}/c02-after-head-drag.png` });

  // discard
  const discard = async () => {
    const b = await bodyHas();
    if (!/Apply \d+ change/.test(b)) return;
    await frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(5000);
    await frame.getByRole("button", { name: /^Discard All$/i }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
    const cb = frame.locator("button").filter({ hasText: /^(Discard|Discard all|Yes|Confirm)/i });
    if (await cb.count()) await cb.last().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(9000);
  };
  await discard();
  R.afterDiscard1 = await readBars();
  console.log("AFTER DISCARD 1", JSON.stringify(R.afterDiscard1));

  // ---------- B: drag the DERIVED tail right 7 days, polling for toasts ----------
  const b2 = (await barOf("WFH-3468").boundingBox())!;
  cx = b2.x + b2.width / 2; cy = b2.y + b2.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const fr of [0.3, 0.6, 1]) await page.mouse.move(cx + (b2.width / 5) * 7 * fr, cy, { steps: 5 });
  await page.waitForTimeout(900);
  R.tailDragLabel = await f.evaluate(() => {
    const t = document.body.innerText || "";
    const m = t.match(/2026-\d\d-\d\d\s*[→\-–]\s*2026-\d\d-\d\d/g);
    return m ? m.slice(0, 5) : [];
  });
  R.tailMidDragX = Math.round((await barOf("WFH-3468").boundingBox())!.x);
  await page.screenshot({ path: `${OUT}/c03-mid-drag-tail.png` });
  await page.mouse.up();
  // poll for 9 s for any transient banner/toast
  R.poll = [];
  for (let i = 0; i < 18; i++) {
    const b = await bodyHas();
    const hit = b.match(/[^.]*?(cannot|required|earliest|must start|snapped|violat|moved to|blocked by)[^.]*\./gi);
    if (hit) R.poll.push({ t: i * 500, hit: hit.slice(0, 4) });
    await page.waitForTimeout(500);
  }
  console.log("TAIL DRAG LABEL", JSON.stringify(R.tailDragLabel), "midX", R.tailMidDragX, "preX", Math.round(b2.x));
  console.log("POLL", JSON.stringify(R.poll, null, 1));
  R.afterTailDrag = await readBars();
  R.tailToolbar = (await bodyHas()).match(/Apply \d+ changes?|Save \(\d+\)/g) || [];
  console.log("AFTER TAIL DRAG", JSON.stringify(R.afterTailDrag), R.tailToolbar);
  await page.screenshot({ path: `${OUT}/c04-after-tail-drag.png` });
  await discard();
  R.afterDiscard2 = await readBars();
  console.log("AFTER DISCARD 2", JSON.stringify(R.afterDiscard2));

  // ---------- ITEM 3: baseline ----------
  await frame.getByRole("button", { name: /Set baseline|Baseline/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);
  const confirm = frame.locator("button").filter({ hasText: /^(Set baseline|Set|Confirm|Yes)/i });
  if (await confirm.count()) await confirm.last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${OUT}/c05-baseline-set.png` });
  R.baselineBody = (await bodyHas()).slice(0, 900);
  R.ghosts = await frame.locator('[data-testid="gantt-baseline-ghost"], [data-testid="baseline-ghost"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), x: Math.round(e.getBoundingClientRect().x), w: Math.round(e.getBoundingClientRect().width) }))).catch(() => []);
  R.barGeom = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), x: Math.round(e.getBoundingClientRect().x), w: Math.round(e.getBoundingClientRect().width) })));
  console.log("GHOSTS", JSON.stringify(R.ghosts));
  console.log("BARGEOM", JSON.stringify(R.barGeom));
  console.log("BASELINE BODY", R.baselineBody);

  // variance surface
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  R.variance = (await bodyHas()).match(/[^|]*?(slip|slipped|net|variance|baseline)[^|]{0,120}/gi)?.slice(0, 12) || [];
  R.varianceTiles = await frame.locator('[data-testid="kpi-tile"]').allInnerTexts().catch(() => []);
  console.log("VARIANCE", JSON.stringify(R.variance, null, 1));
  console.log("TILES", JSON.stringify(R.varianceTiles));
  await page.screenshot({ path: `${OUT}/c06-baseline-dashboard.png` });
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/c07-baseline-gantt.png` });

  // clear baseline
  await frame.getByRole("button", { name: /Clear baseline|Baseline/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2500);
  const cl = frame.locator("button").filter({ hasText: /Clear baseline|^Clear$/i });
  if (await cl.count()) await cl.last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  R.afterClear = (await bodyHas()).slice(0, 500);
  console.log("AFTER CLEAR", R.afterClear);
  await page.screenshot({ path: `${OUT}/c08-baseline-cleared.png` });
  R.finalStaged = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(await bodyHas());
  console.log("STAGED_AFTER_CLEANUP =", R.finalStaged);

  fs.writeFileSync(`${OUT}/c-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
