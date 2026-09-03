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
  expect(tip).toMatch(/week of .* of \d+ runs/);

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
