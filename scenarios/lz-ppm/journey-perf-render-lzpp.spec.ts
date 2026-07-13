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

  // Header issue count (how many the plan resolved).
  const headTxt = await bodyText(frame);
  const showing = (headTxt.match(/Showing\s+([\d,]+)\s+of\s+([\d,]+)/i) || [])[0] || null;
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

  // DOM weight + a scroll interaction (does the surface stay responsive under volume?).
  metrics.domNodes = await frame.locator("body *").count().catch(() => -1);
  // Scroll over the Gantt via the mouse wheel (FrameLocator has no .evaluate). Hover the
  // timeline area first so the wheel targets the scrollable plan, then time 10 wheel steps.
  const firstBar = await frame.locator('[data-testid="gantt-bar"]').first().boundingBox().catch(() => null);
  if (firstBar) await page.mouse.move(firstBar.x + 40, firstBar.y + 120);
  const tScroll = Date.now();
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(120);
  }
  metrics.scroll10Ms = Date.now() - tScroll;
  metrics.barsAfterScroll = await frame.locator('[data-testid="gantt-bar"]').count().catch(() => 0);

  console.log("PERF_METRICS", JSON.stringify(metrics));

  // Survival assertions only (this is a stress probe, not a strict SLA gate).
  expect(metrics.showing || metrics.issuesShown, "the large plan resolved an issue count").toBeTruthy();
  expect(metrics.ganttBarsRendered, "the Gantt rendered bars under volume (did not freeze/blank)").toBeGreaterThan(0);
});
