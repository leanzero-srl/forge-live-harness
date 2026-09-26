// LIVE CHECK dev 6.81.0 — ITEM 3: baseline on the untouched lagged plan.
// Discriminator for 5e2a3d8b: the baseline must be the SETTLED schedule.
//   settled WFH-3468 = 10-26/10-30  (bar x ~719, w 70 at week zoom)
//   stored  WFH-3468 = 10-19/10-23  (would be x ~621)
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

test("item 3 — baseline is the settled schedule, 0 slip", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  const R: any = {};
  R.cardBefore = { finish: await txt(card.locator('[data-testid="plan-finish"]')), room: await txt(card.locator('[data-testid="plan-room"]')), verdict: await txt(card.locator('[data-testid="plan-verdict-chip"]')) };
  await card.click();
  await page.waitForTimeout(16000);

  const geom = async () => ({
    bars: await frame.locator('[data-testid="gantt-bar"]').evaluateAll((e: any[]) => e.map((x) => ({ k: x.getAttribute("data-key"), x: Math.round(x.getBoundingClientRect().x), w: Math.round(x.getBoundingClientRect().width), s: x.getAttribute("data-bar-start"), d: x.getAttribute("data-bar-due"), der: x.getAttribute("data-derived") }))),
    ghosts: await frame.locator('[data-testid="gantt-baseline-ghost"]').evaluateAll((e: any[]) => e.map((x) => ({ k: x.getAttribute("data-key"), x: Math.round(x.getBoundingClientRect().x), w: Math.round(x.getBoundingClientRect().width), title: x.getAttribute("title") }))),
  });

  // ---- dashboard: hero + set baseline
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(11000);
  R.hero = {
    verdict: await txt(frame.locator('[data-testid="plan-health-verdict"]')),
    punchline: await txt(frame.locator('[data-testid="plan-health-punchline"]')),
  };
  console.log("HERO", JSON.stringify(R.hero), "CARD", JSON.stringify(R.cardBefore));
  await frame.locator('[data-testid="set-baseline"]').first().dispatchEvent("click");
  await page.waitForTimeout(12000);
  R.varianceZero = {
    panel: await frame.locator('[data-testid="variance-panel"]').count(),
    net: await frame.locator('[data-testid="variance-panel"]').first().getAttribute("data-net").catch(() => null),
    slipped: await frame.locator('[data-testid="variance-panel"]').first().getAttribute("data-slipped").catch(() => null),
    ahead: await frame.locator('[data-testid="variance-panel"]').first().getAttribute("data-ahead").catch(() => null),
    rows: await frame.locator('[data-testid="variance-row"]').count(),
    hint: (await txt(frame.locator(".lz-dash-card-hint").filter({ hasText: /Baseline set|Freeze/ }).first())).replace(/\n/g, " "),
    clearPresent: await frame.locator('[data-testid="clear-baseline"]').count(),
  };
  console.log("VARIANCE@0", JSON.stringify(R.varianceZero));
  await page.screenshot({ path: `${OUT}/d01-baseline-set.png` });

  // ---- gantt with a 0-slip baseline: ghosts suppressed by design
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  R.g0 = await geom();
  console.log("GEOM @0slip", JSON.stringify(R.g0));
  await page.screenshot({ path: `${OUT}/d02-gantt-baseline-0slip.png` });

  // ---- create slip: drag the FREE HEAD +7 days; ghosts must appear at the SETTLED positions
  const head = frame.locator('[data-testid="gantt-bar"][data-key="WFH-3466"]').first();
  const b = (await head.boundingBox())!;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const fr of [0.3, 0.6, 1]) await page.mouse.move(cx + (b.width / 5) * 7 * fr, cy, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(6000);
  R.g1 = await geom();
  console.log("GEOM @slip", JSON.stringify(R.g1, null, 1));
  await page.screenshot({ path: `${OUT}/d03-gantt-ghosts.png` });

  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(11000);
  R.varianceSlip = {
    net: await frame.locator('[data-testid="variance-panel"]').first().getAttribute("data-net").catch(() => null),
    slipped: await frame.locator('[data-testid="variance-panel"]').first().getAttribute("data-slipped").catch(() => null),
    ahead: await frame.locator('[data-testid="variance-panel"]').first().getAttribute("data-ahead").catch(() => null),
    rows: await frame.locator('[data-testid="variance-row"]').evaluateAll((e: any[]) => e.map((x) => ({ k: x.getAttribute("data-key"), slip: x.getAttribute("data-slip") }))),
  };
  console.log("VARIANCE@slip", JSON.stringify(R.varianceSlip));
  await page.screenshot({ path: `${OUT}/d04-variance-slip.png` });

  // ---- restore: discard + clear baseline
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  const body = async () => (await txt(frame.locator("body"))).replace(/\s+/g, " ");
  if (/Apply \d+ change/.test(await body())) {
    await frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(5000);
    await frame.getByRole("button", { name: /^Discard All$/i }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
    const cb = frame.locator("button").filter({ hasText: /^(Discard|Discard all|Yes|Confirm)/i });
    if (await cb.count()) await cb.last().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(9000);
  }
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  await frame.locator('[data-testid="clear-baseline"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(9000);
  R.afterClear = {
    clearPresent: await frame.locator('[data-testid="clear-baseline"]').count(),
    setLabel: (await txt(frame.locator('[data-testid="set-baseline"]'))).replace(/\n/g, " "),
    hint: (await txt(frame.locator(".lz-dash-card-hint").filter({ hasText: /Baseline set|Freeze/ }).first())).replace(/\n/g, " "),
  };
  R.finalStaged = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(await body());
  console.log("AFTER CLEAR", JSON.stringify(R.afterClear), "STAGED_AFTER_CLEANUP =", R.finalStaged);
  await page.screenshot({ path: `${OUT}/d05-cleared.png` });
  fs.writeFileSync(`${OUT}/d-results.json`, JSON.stringify(R, null, 2));
  expect(R.finalStaged).toBe(false);
});
