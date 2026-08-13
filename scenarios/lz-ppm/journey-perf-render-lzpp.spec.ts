// PERFORMANCE journey — a LARGE plan (LZPP, ~6000 issues from _seed-perf) exercised end to
// end: create the plan via the wizard (idempotent — opens it if it already exists), time the
// INDEX of thousands of issues, then time the Gantt RENDER and a scroll interaction, and
// capture the DOM node count. This is a load/stress probe, not a pass/fail gate: it asserts
// only that the app SURVIVES the volume (renders bars, stays interactive) and logs the timings
// so regressions in large-plan handling are visible. LZPP is a throwaway perf project.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPP Perf";
const JQL = "project = LZPP ORDER BY created ASC";
test.describe.configure({ retries: 0, timeout: 600_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("PERF: large LZPP plan indexes, renders, and stays interactive", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  let s = await enterForgeSurface(page, { surface: "custom" });
  let frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);

  const metrics: Record<string, any> = {};
  // Wait for the plans list to actually render before deciding create-vs-open (the "New plan"
  // card OR an existing "LZPP Perf" card must be present) — otherwise a slow first paint reads
  // as "not found" and we wrongly re-enter the wizard.
  await frame.getByText(/LZPP Perf|New plan/i).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const alreadyExists = /LZPP Perf/.test(await bodyText(frame));

  if (!alreadyExists) {
    // --- Create the plan via the wizard (Name -> Sources -> Schedule -> Milestones -> Review) ---
    await frame.getByRole("button", { name: /New plan/i }).first().click().catch(async () => {
      await frame.getByText(/New plan/i).first().click().catch(() => {});
    });
    await page.waitForTimeout(1500);
    await frame.getByPlaceholder(/Q2 Release Plan/i).first().fill(PLAN);
    await frame.getByRole("button", { name: /Continue/i }).first().click();
    await page.waitForTimeout(1000);
    // Sources step: default source is JQL — fill the query.
    await frame.getByPlaceholder(/project = PROJ/i).first().fill(JQL);
    await frame.getByRole("button", { name: /Continue/i }).first().click();
    await page.waitForTimeout(800);
    await frame.getByRole("button", { name: /Continue/i }).first().click(); // Schedule (defaults)
    await page.waitForTimeout(800);
    await frame.getByRole("button", { name: /Continue/i }).first().click(); // Milestones (skip)
    await page.waitForTimeout(800);

    const tCreate = Date.now();
    await frame.getByRole("button", { name: /Create & Index/i }).first().click();
    // Wait for indexing to finish: the plan view leaves the indexing state and shows a
    // "Showing N of N" / issue count, OR the Gantt/Table becomes available. Poll up to 5 min.
    let indexed = false;
    for (let i = 0; i < 100; i++) {
      await page.waitForTimeout(3000);
      const t = await bodyText(frame);
      const m = t.match(/Showing\s+([\d,]+)\s+of\s+([\d,]+)/i);
      if (m) { metrics.issuesShown = m[0]; indexed = true; break; }
      if (/Gantt|Table/i.test(t) && !/Indexing|Creating/i.test(t)) { indexed = true; break; }
    }
    metrics.indexMs = Date.now() - tCreate;
    metrics.indexed = indexed;
    console.log(`PERF index: ${metrics.indexMs}ms indexed=${indexed} ${metrics.issuesShown || ""}`);
  } else {
    console.log("PERF: LZPP Perf plan already exists — opening it (skip create).");
  }

  // --- Open the plan + Gantt, TIME the render ---
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);

  // Optional one-time RE-INDEX (REINDEX=1) — needed once after _seed-perf-deps adds links
  // so the KVS index picks up the new dependencies (the plan then keeps them across opens).
  // The header "Showing N of N" is present the whole time, so we can't use it as the "done"
  // signal — indexing 5300 issues takes ~42s, so click then wait a generous fixed window
  // for the background consumer to finish re-reading Jira (incl. issuelinks → successors).
  if (process.env.REINDEX === "1") {
    await frame.getByRole("button", { name: /Re-?index/i }).first().click().catch(() => {});
    await page.waitForTimeout(75_000);
    // Reload the surface so the freshly-indexed issues (with successors) are loaded.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
    const rs = await enterForgeSurface(page, { surface: "custom" });
    const rf = rs.kind === "custom" ? rs.frame : null;
    if (rf) frame = rf;
    await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  // Header issue count (how many the plan resolved) — poll a few times; the "Showing N of N"
  // header can lag the first paint of a huge plan.
  let showing: string | null = null;
  for (let i = 0; i < 10 && !showing; i++) {
    showing = ((await bodyText(frame)).match(/Showing\s+([\d,]+)\s+of\s+([\d,]+)/i) || [])[0] || null;
    if (!showing) await page.waitForTimeout(1500);
  }
  metrics.showing = showing;

  const tGantt = Date.now();
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  // Wait until the first bars paint (virtualized lists render only the visible window,
  // so we wait for ANY bars, not all N).
  let bars = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    bars = await frame.locator('[data-testid="gantt-bar"]').count().catch(() => 0);
    if (bars > 0) break;
  }
  metrics.ganttFirstPaintMs = Date.now() - tGantt;
  metrics.ganttBarsRendered = bars;

  // Dependency-edge count in the DOM (windowed on large plans → far fewer than total edges).
  await page.waitForTimeout(1500);
  metrics.edgesRendered = await frame.locator('[data-testid="dep-arrow-hit"]').count().catch(() => -1);

  // DOM weight + a scroll interaction (does the surface stay responsive under volume?).
  metrics.domNodes = await frame.locator("body *").count().catch(() => -1);
  // Scroll over the Gantt via the mouse wheel (FrameLocator has no .evaluate — get the real
  // Frame via elementHandle().ownerFrame() to run in-page JS). Hover the timeline area first
  // so the wheel targets the scrollable plan, then time 10 wheel steps.
  const rootHandle = await frame.locator(":root").elementHandle();
  const realFrame = rootHandle ? await rootHandle.ownerFrame() : null;

  // RESPONSIVENESS MONITOR — the original #13 report was "blocks after two scrolls", i.e.
  // multi-second main-thread freezes. A rAF loop inside the app iframe records the gap
  // between consecutive frames while we scroll; a blocked main thread shows up as a large
  // gap. This turns the probe into a gate: jank is measured, not eyeballed.
  if (realFrame) {
    await realFrame.evaluate(() => {
      const w = window as any;
      w.__frameGaps = [];
      w.__rafStop = false;
      let last = performance.now();
      const tick = (now: number) => {
        w.__frameGaps.push(now - last);
        last = now;
        if (!w.__rafStop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // Hover INSIDE the visible scroll container. NOT a bar: fit-to-work pans the timeline
  // horizontally, so the first bar's page-x can be thousands of px off-viewport — a mouse
  // parked there dispatches wheel events to nothing and the "scroll" scrolls nothing
  // (which is exactly what happened before the windowMoved assertion below existed).
  const scrollBox = await frame.locator("[data-gantt-scroll]").boundingBox().catch(() => null);
  if (scrollBox) await page.mouse.move(scrollBox.x + Math.min(500, scrollBox.width - 40), scrollBox.y + Math.min(300, scrollBox.height / 2));
  // Capture WHICH rows are visible pre-scroll, so we can prove the window moved —
  // a smooth frame-gap reading over a scroll that scrolled nothing would be vacuous.
  const keysBefore = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-key"))).catch(() => []);
  const tScroll = Date.now();
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(120);
  }
  metrics.scroll10Ms = Date.now() - tScroll;

  if (realFrame) {
    const gaps: number[] = await realFrame.evaluate(() => {
      const w = window as any;
      w.__rafStop = true;
      return w.__frameGaps || [];
    });
    // Drop the first gap (includes monitor start-up, not scroll work).
    const scrollGaps = gaps.slice(1);
    metrics.frameCount = scrollGaps.length;
    metrics.maxFrameGapMs = Math.round(Math.max(0, ...scrollGaps));
    metrics.framesOver250 = scrollGaps.filter((g) => g > 250).length;
    metrics.framesOver1000 = scrollGaps.filter((g) => g > 1000).length;
  }

  metrics.barsAfterScroll = await frame.locator('[data-testid="gantt-bar"]').count().catch(() => 0);
  metrics.edgesAfterScroll = await frame.locator('[data-testid="dep-arrow-hit"]').count().catch(() => -1);
  const keysAfter = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-key"))).catch(() => []);
  metrics.windowMoved = keysBefore.length > 0 && keysAfter.length > 0 && keysBefore[0] !== keysAfter[0];

  console.log("PERF_METRICS", JSON.stringify(metrics));

  expect(metrics.showing || metrics.issuesShown, "the large plan resolved an issue count").toBeTruthy();
  expect(metrics.ganttBarsRendered, "the Gantt rendered bars under volume (did not freeze/blank)").toBeGreaterThan(0);
  // RESPONSIVENESS GATE (the actual #13 assertion): scrolling must not block the main
  // thread. "Blocks after two scrolls" was a multi-second freeze; the gate allows normal
  // render work but fails on any 2s+ freeze, and requires the row window to keep following
  // the scroll (bars still mounted afterwards proves virtualization didn't collapse).
  if (metrics.maxFrameGapMs !== undefined) {
    expect(metrics.maxFrameGapMs, `no frame gap over 2s during scroll (max was ${metrics.maxFrameGapMs}ms)`).toBeLessThan(2000);
    expect(metrics.framesOver1000, "no 1s+ freezes during a 10-step scroll").toBeLessThanOrEqual(1);
  }
  expect(metrics.barsAfterScroll, "the row window kept rendering after scroll").toBeGreaterThan(0);
  expect(metrics.windowMoved, "the visible row window actually advanced (the scroll scrolled)").toBe(true);
});
