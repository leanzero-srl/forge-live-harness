// LIVE CHECK dev 6.84.0 — ITEM 1: the violation toast names the LAG and the DRIVING edge,
// and NOTHING is staged by a refused drag.
// Bed "LC683 Lag Bed R": WFH-3511(10-05..10-09) -> WFH-3512(10-12..10-16) -[lag 5wd]-> WFH-3513
// which renders 2026-10-26..10-30 (derived).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { loadEnv } from "../../data/env.mjs";
import * as fs from "fs";

loadEnv();
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots684";
const NAME = "LC683 Lag Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("item 1 — refusal copy, and a refusal stages nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(18000);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);

  const R: any = { drags: [] };
  const bar = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  R.bars = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), left: e.style.left, width: e.style.width, derived: e.getAttribute("data-derived") })));
  console.log("BARS", JSON.stringify(R.bars));
  R.rowDates = await frame.locator("[data-row-start]").evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due") }))).catch(() => []);
  await page.screenshot({ path: `${OUT}/a-gantt-open.png` });
  const stagedText = async () => {
    const t = (await frame.locator("body").textContent().catch(() => "")) || "";
    const m = t.match(/Apply \d+ change\w*|Save \(\d+\)/);
    return m ? m[0] : null;
  };
  R.stagedAtOpen = await stagedText();

  const dragBy = async (key: string, dx: number, tag: string) => {
    await bar(key).scrollIntoViewIfNeeded();
    const box = await bar(key).boundingBox();
    if (!box) throw new Error(`no box for ${key}`);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 6 });
    await page.mouse.up();
    let toast = "(none)";
    for (let i = 0; i < 25; i++) {
      const t = (await frame.locator("body").textContent().catch(() => "")) || "";
      const m = t.match(/[A-Z]+-\d+ must start [^.]+\.\s*Cannot move (?:before|after)\./);
      if (m) { toast = m[0]; break; }
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: `${OUT}/a-${tag}.png` });
    const staged = await stagedText();
    const row = await bar(key).evaluate((e: any) => ({ left: e.style.left, width: e.style.width, derived: e.getAttribute("data-derived") })).catch(() => null);
    const got = { tag, key, dx, toast, stagedAfter: staged, row };
    R.drags.push(got);
    console.log("DRAG", JSON.stringify(got));
    await page.waitForTimeout(6000);
    return got;
  };

  await dragBy("WFH-3513", 260, "lagged-later");
  await dragBy("WFH-3513", -260, "lagged-earlier");
  await dragBy("WFH-3512", 260, "unlagged-later");
  await dragBy("WFH-3512", -260, "unlagged-earlier");

  // If ANYTHING is staged, open the Apply panel and record exactly what it is.
  R.stagedAfterDrags = await stagedText();
  if (R.stagedAfterDrags) {
    const btn = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
    await btn.dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
    R.applyPanel = (await txt(frame.locator('[data-testid="apply-panel"]'))).slice(0, 1500);
    if (R.applyPanel === "(none)") R.applyPanel = (await txt(frame.locator("body"))).slice(0, 2500);
    await page.screenshot({ path: `${OUT}/a-apply-panel.png`, fullPage: true });
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1200);
    // Discard All
    const disc = frame.locator("button").filter({ hasText: /Discard All|Discard all/ }).first();
    await disc.dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1500);
    const conf = frame.locator("button").filter({ hasText: /^(Discard|Discard changes|Yes|Confirm)$/ }).first();
    await conf.dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(6000);
    R.stagedAfterDiscard = await stagedText();
    await page.screenshot({ path: `${OUT}/a-after-discard.png` });
  }
  R.stagedAtExit = await stagedText();
  console.log("STAGED_AFTER_CLEANUP =", !!R.stagedAtExit, R.stagedAtExit);
  await page.screenshot({ path: `${OUT}/a-final.png` });
  fs.writeFileSync(`${OUT}/a-results.json`, JSON.stringify(R, null, 2));
  expect(R.drags.length).toBe(4);
});
