// SCHEDULE CONFIDENCE journey (read-only on LZPT).
//
// The dashboard's Monte Carlo card runs the plan's own cascade engine under
// duration uncertainty and reports P50/P80/P90 finish dates. Assert the card
// actually computes on the real 45-issue plan: percentiles are populated,
// ordered, and never earlier than the deterministic planned finish; the histogram
// paints bars whose counts sum to the run count; switching the uncertainty preset
// to High re-simulates and cannot make P90 earlier.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 1, timeout: 420_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("dashboard: schedule confidence computes ordered P50/P80/P90 on LZPT", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);

  await frame.getByText("LZPT Scenarios", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click();

  const card = frame.locator('[data-testid="schedule-confidence"]').first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  // Wait for the simulation to land (data-p80 is set only from a finished result).
  // FrameLocator has no waitForFunction: poll the attribute (set only from a finished result).
  const waitForP90Change = async (prev: string | null, timeoutMs: number) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = await card.getAttribute("data-p90").catch(() => null);
      if (v && v !== prev) return v;
      await page.waitForTimeout(500);
    }
    return null;
  };
  expect(await waitForP90Change(null, 90_000), "the simulation finished").toBeTruthy();

  const read = async () => ({
    p50: await card.getAttribute("data-p50"), p80: await card.getAttribute("data-p80"), p90: await card.getAttribute("data-p90"),
    runs: Number(await card.getAttribute("data-runs")), leaves: Number(await card.getAttribute("data-leaves")),
    planned: (await card.locator('[data-testid="sc-planned"]').textContent()) || "",
    bars: await card.locator('[data-testid="sc-bar"]').evaluateAll((els: any[]) => els.map((e) => Number(e.getAttribute("data-count")))),
    milestones: await card.locator('[data-testid="sc-milestone"]').count(),
    drivers: await card.locator('[data-testid="sc-driver"]').count(),
  });
  const a = await read();
  console.log("MEDIUM", JSON.stringify(a));
  expect(a.leaves, "there are uncertain tasks to simulate").toBeGreaterThan(0);
  expect(a.p50! <= a.p80! && a.p80! <= a.p90!, "P50 <= P80 <= P90").toBe(true);
  expect(a.bars.reduce((x, y) => x + y, 0), "histogram counts sum to the runs").toBe(a.runs);
  expect(a.drivers, "drivers listed").toBeGreaterThan(0);
  await card.screenshot({ path: "evidence/schedule-confidence-medium.png" }).catch(() => {});

  // Hover a bar → tooltip. A real mouse move (not a forced hover on the iframe's
  // FrameLocator, which landed nowhere) — same gesture the offline probe verified.
  const bar = card.locator('[data-testid="sc-bar"]').first();
  await bar.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const bb = await bar.boundingBox();
  if (bb) { await page.mouse.move(bb.x - 40, bb.y - 40); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 4 }); }
  await page.waitForTimeout(400);
  const tip = (await card.locator('[role="status"]').textContent().catch(() => "")) || "";
  console.log("TOOLTIP", tip);
  // The card used to say "week of X"; the buckets are 7-day windows anchored to the
  // earliest simulated finish, not calendar weeks, and the copy now says so.
  expect(tip).toMatch(/\d+ of \d+ runs \(\d+%\) finish in this 7-day window/);
  expect(tip, "the bucket names its own date range").toMatch(/[A-Z][a-z]{2} \d+.*[A-Z][a-z]{2} \d+/);

  // Switch to High uncertainty (custom Select) → re-simulates; P90 cannot get earlier.
  await card.getByRole("combobox").first().click();
  await frame.getByRole("option", { name: /High/ }).first().click();
  await waitForP90Change(a.p90, 90_000); // may legitimately stay equal on a tiny plan
  const b = await read();
  console.log("HIGH", JSON.stringify(b));
  expect(b.p90! >= a.p90!, "High uncertainty never yields an earlier P90").toBe(true);
  await card.screenshot({ path: "evidence/schedule-confidence-high.png" }).catch(() => {});

  // --- NOT-DEGENERATE: the simulation must actually vary what it claims to vary --
  // LZPT's finish is owned by an OPEN 6-working-day leaf (FANOUT-4), so a ±60%
  // preset cannot collapse to a single point. A degenerate P50==P80==P90==planned
  // is the signature of the card simulating with the RAW Jira durations (null →
  // treated as 1 → every sample rounds back to 1 → nothing moves) instead of the
  // normalized working-day spans the Table renders. Verified offline on the same
  // plan data: normalized → P50 Oct 13 / P90 Oct 14 (medium), P50 Oct 14 / P90 Oct 16
  // (high); raw → P50=P80=P90=planned for BOTH presets.
  expect(b.p90! > b.p50!, "High uncertainty on a 6-day terminal task must spread the finish").toBe(true);

  // Cross-check the durations the card should have used — read AFTER the dashboard,
  // because opening the Table first makes the card compute correctly and would mask it.
  await frame.getByRole("button", { name: /^Table/i }).first().click();
  await page.waitForTimeout(3500);
  const rows = frame.locator('[data-testid="table-row"]');
  const durs: Record<string, string | null> = {};
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const key = await rows.nth(i).getAttribute("data-row-key");
    if (key && ["LZPT-209", "LZPT-215"].includes(key)) durs[key] = await rows.nth(i).getAttribute("data-row-duration");
  }
  console.log("TABLE DURATIONS (what the simulation should see)", JSON.stringify(durs));
  expect(Number(durs["LZPT-209"] || 0), "the finish-owning task is multi-day, so uncertainty must bite").toBeGreaterThan(1);
});

// The trigger that actually produced the false-certainty reading in the wild.
//
// A fresh page load self-corrects, so the first test above passes even with the
// defect present. What does NOT self-correct is a RAW reload into an already-open
// session: `refreshPlan` (the same path the hourly trigger takes) bumps meta.version
// and emits plan:version {external:true}; the open client then reloads issues
// straight from KVS via the realtime remoteWrite branch or the tab-switch
// syncIfNeeded — and PlanView's duration normalization is latched behind
// `!kvsSnapshot`, so on those paths it never runs again. On LZPT every issue is
// stored with duration null (team-managed project, no PPM Duration field), so the
// card then simulates 1-day tasks and reports "100% chance to make it".
//
// Sequence: Dashboard (good numbers) -> Table -> refreshPlan -> Dashboard -> the
// numbers must still be a real distribution.
test("dashboard: a background refresh cannot turn the card into false certainty", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);

  const plans = (await getTestState("lz-ppm", { what: "plans" })).plans as any[];
  const lzpt = plans.find((p) => p.name === "LZPT Scenarios");
  expect(lzpt, "the LZPT bed plan exists").toBeTruthy();

  await frame.getByText("LZPT Scenarios", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click();

  const card = frame.locator('[data-testid="schedule-confidence"]').first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  const settle = async (prev: string | null) => {
    for (let i = 0; i < 180; i++) {
      const v = await card.getAttribute("data-p90").catch(() => null);
      if (v && v !== prev) return v;
      await page.waitForTimeout(500);
    }
    return null;
  };
  expect(await settle(null), "the first simulation finished").toBeTruthy();
  const before = { p50: await card.getAttribute("data-p50"), p90: await card.getAttribute("data-p90") };
  console.log("BEFORE REFRESH", JSON.stringify(before));

  // Leave the dashboard, force the raw reload, come back.
  await frame.getByRole("button", { name: /^Table/i }).first().click();
  await page.waitForTimeout(1500);
  const r = await getTestState("lz-ppm", { what: "refreshPlan", planId: lzpt.id });
  console.log("REFRESH", JSON.stringify(r).slice(0, 160));
  await page.waitForTimeout(6000);              // let the realtime event land
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click();  // fires syncIfNeeded
  await page.waitForTimeout(2000);
  await card.waitFor({ state: "visible", timeout: 60_000 });
  for (let i = 0; i < 180; i++) {
    if (await card.getAttribute("data-p90")) break;
    await page.waitForTimeout(500);
  }
  const after = { p50: await card.getAttribute("data-p50"), p90: await card.getAttribute("data-p90") };
  const bars = await card.locator('[data-testid="sc-bar"]').evaluateAll((els: any[]) => els.map((e) => Number(e.getAttribute("data-count"))));
  const planned = (await card.locator('[data-testid="sc-planned"]').textContent()) || "";
  console.log("AFTER REFRESH", JSON.stringify(after), "bars", bars.join("/"), "|", planned.replace(/\s+/g, " "));
  await card.screenshot({ path: "evidence/schedule-confidence-after-refresh.png" }).catch(() => {});

  expect(after.p90, "the card still has a result after the refresh").toBeTruthy();
  expect(after.p90! > after.p50!, "a background refresh must not collapse the distribution to a point").toBe(true);
  expect(/100% chance to make it/.test(planned), "and must not claim certainty it cannot have").toBe(false);
  expect(after.p50, "the distribution is the same one, not a raw-duration replay").toBe(before.p50);
});

// The LATCH itself, measured on a surface that has nothing to do with the card.
//
// PlanView normalizes "duration = the working-day span of start->due" once, behind
// `!kvsSnapshot && calendarLoaded`. Six of the eight paths that replace `issues`
// with raw KVS data never null kvsSnapshot, so after one of those reloads the whole
// UI is looking at raw Jira durations — on LZPT, null. The Table is the honest
// witness: its Duration column is the normalized span (LZPT-209 = 6 working days,
// LZPT-215 = 42). If those go blank or 1 after a background refresh, every
// duration-derived number in the app (Table, CPM, workload, the Monte Carlo card)
// is reading raw data for the rest of the session.
test("table: a background refresh must not un-normalize the durations", async ({ page }) => {
  // EXPECTED TO FAIL — this is a live witness for a CONFIRMED, currently UNFIXED defect,
  // not a flake. The fix (dropping the `!kvsSnapshot` latch in PlanView) was designed and
  // gated on a fixed-point proof; the proof held, but it exposed a worse consequence —
  // an ungated pass rewrites a declared-zero MILESTONE's `_original.duration` from 0 to
  // its span, and Discard All persists `_original`, destroying the declaration for good
  // (commit 34136ecd). So it was deliberately not shipped. When someone lands the
  // narrowed fix, this test starts PASSING and test.fail() turns that into a red run —
  // which is the signal to delete this marker.
  test.fail();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);

  const plans = (await getTestState("lz-ppm", { what: "plans" })).plans as any[];
  const lzpt = plans.find((p) => p.name === "LZPT Scenarios");
  expect(lzpt, "the LZPT bed plan exists").toBeTruthy();
  // START CLEAN: this test deliberately triggers the raw reload, and while the app is
  // in that state its 1.5s autosave persists a draft of `duration: null` for every
  // dated issue — which then re-applies on the next load and would make a later run
  // read "" before it has done anything. Clear first, and clear again in the finally.
  const pre = await getTestState("lz-ppm", { what: "clearDrafts", planId: lzpt.id });
  console.log("DRAFTS CLEARED BEFORE =", JSON.stringify(pre));

  await frame.getByText("LZPT Scenarios", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);

  const readDurations = async () => {
    await frame.getByRole("button", { name: /^Table/i }).first().click();
    const rows = frame.locator('[data-testid="table-row"]');
    const out: Record<string, string | null> = {};
    for (let attempt = 0; attempt < 30; attempt++) {
      await page.waitForTimeout(1000);
      const n = await rows.count();
      for (let i = 0; i < n; i++) {
        const key = await rows.nth(i).getAttribute("data-row-key");
        if (key && ["LZPT-209", "LZPT-215"].includes(key)) out[key] = await rows.nth(i).getAttribute("data-row-duration");
      }
      if (Number(out["LZPT-215"] || 0) > 1) break;   // calendar-gated: wait for the span to land
    }
    return out;
  };

  try {
    const before = await readDurations();
    console.log("DURATIONS BEFORE", JSON.stringify(before));
    expect(Number(before["LZPT-215"] || 0), "the bed's long-run task is 42 working days").toBeGreaterThan(1);

    // Force the raw reload the hourly refresh causes, then come back through a tab switch.
    await frame.getByRole("button", { name: /^Dashboard/i }).first().click();
    await page.waitForTimeout(1200);
    await getTestState("lz-ppm", { what: "refreshPlan", planId: lzpt.id });
    await page.waitForTimeout(6000);
    const after = await readDurations();
    console.log("DURATIONS AFTER", JSON.stringify(after));
    expect(after["LZPT-215"], "the refresh must not un-normalize the durations").toBe(before["LZPT-215"]);
    expect(after["LZPT-209"]).toBe(before["LZPT-209"]);
  } finally {
    const post = await getTestState("lz-ppm", { what: "clearDrafts", planId: lzpt.id }).catch(() => null);
    console.log("DRAFTS CLEARED AFTER =", JSON.stringify(post));
  }
});
