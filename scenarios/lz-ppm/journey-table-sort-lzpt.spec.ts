// PERSISTENT feature journey — Table SORT correctness on LZPT (read-only, view op).
// Sorting by a column must produce a monotonic rendered order with unset values
// LAST, in BOTH directions, without dropping rows. Deterministic on the seeded bed.
// Sort is a localStorage view pref (ephemeral per run) — mutates NOTHING; never Apply.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
// retries=2: the Duration sort reads calendar-gated normalized durations (Forge Lambda
// cold-start, high variance). The settle below waits for normalization; retries cover the
// rare over-window case. Cannot mask a real regression (fails all 3 attempts if durations
// never populate).
test.describe.configure({ retries: 2, timeout: 220_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Table sort: monotonic order, unset last, both directions, no row loss", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  await page.waitForTimeout(1800);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // Read the rendered rows in DOM order for a given attribute.
  const rows = (attr: string) => realFrame!.evaluate((a) =>
    Array.from(document.querySelectorAll('[data-testid="table-row"]')).map((el) => ({
      key: el.getAttribute("data-row-key"),
      v: el.getAttribute(a),
    })), attr);

  // Click the sort header by testid (the accessible name changes once the sort
  // arrow ▲/▼ is appended, so a name matcher can't re-find it for the toggle).
  const clickHeader = async (colKey: string) => {
    await frame.locator(`[data-testid="table-sort-${colKey}"]`).first().click().catch(() => {});
    await page.waitForTimeout(1200);
  };
  // Read the header's current sort direction (robust to any persisted pref carried
  // over from a prior run — we assert monotonicity MATCHING the actual aria-sort).
  const sortDir = (colKey: string) => realFrame!.evaluate((k) => {
    const el = document.querySelector(`[data-testid="table-sort-${k}"]`);
    const a = el?.getAttribute("aria-sort");
    return a === "ascending" ? "asc" : a === "descending" ? "desc" : "none";
  }, colKey) as Promise<"asc" | "desc" | "none">;

  // Monotonic checker: non-empty values must be sorted per `cmp`, and every empty
  // value must come AFTER the last non-empty one (unset-last invariant).
  const assertMonotonic = (vals: string[], dir: "asc" | "desc", label: string, numeric = false) => {
    const idxNonEmpty = vals.map((v, i) => (v && v !== "" ? i : -1)).filter((i) => i >= 0);
    const nonEmpty = idxNonEmpty.map((i) => vals[i]);
    // unset-last: once an empty appears, no non-empty may follow
    let seenEmpty = false, order = true;
    for (const v of vals) { if (!v || v === "") seenEmpty = true; else if (seenEmpty) order = false; }
    expect(order, `${label}: all unset values sort LAST (${dir})`).toBeTruthy();
    // monotonic over the non-empty values
    for (let i = 1; i < nonEmpty.length; i++) {
      const a = numeric ? Number(nonEmpty[i - 1]) : nonEmpty[i - 1];
      const b = numeric ? Number(nonEmpty[i]) : nonEmpty[i];
      const ok = dir === "asc" ? a <= b : a >= b;
      expect(ok, `${label}: row ${i} (${nonEmpty[i - 1]} -> ${nonEmpty[i]}) is ${dir}`).toBeTruthy();
    }
    return nonEmpty.length;
  };

  // Baseline row count (unsorted tree view).
  const baseCount = (await rows("data-row-key")).length;
  console.log("BASE_ROWS:", baseCount);
  expect(baseCount, "table rendered rows").toBeGreaterThan(20);

  // --- Sort by Start Date (direction 1) ---
  await clickHeader("startDate");
  const dir1 = await sortDir("startDate");
  const start1 = (await rows("data-row-start")).map((r) => r.v || "");
  console.log(`START ${dir1} (first 8):`, JSON.stringify(start1.slice(0, 8)));
  expect(dir1, "clicking the header engages a sort").not.toBe("none");
  expect((await rows("data-row-key")).length, "sort keeps every row (no loss)").toBe(baseCount);
  const nStart = assertMonotonic(start1, dir1 as "asc" | "desc", "startDate");
  expect(nStart, "several rows have a start date to sort").toBeGreaterThan(10);

  // --- Toggle Start Date (direction 2) — must flip AND stay correct ---
  await clickHeader("startDate");
  const dir2 = await sortDir("startDate");
  const start2 = (await rows("data-row-start")).map((r) => r.v || "");
  console.log(`START ${dir2} (first 8):`, JSON.stringify(start2.slice(0, 8)));
  expect(dir2, "second click flips the sort direction").not.toBe(dir1);
  expect((await rows("data-row-key")).length, "toggled sort keeps every row").toBe(baseCount);
  assertMonotonic(start2, dir2 as "asc" | "desc", "startDate");

  // --- Sort by Duration (numeric column) ---
  // Durations are CALENDAR-GATED (normalizeImportedDurations runs only after the calendar
  // resolver returns) — on a COLD open the column is empty for a bit, and an all-empty
  // column sorts VACUOUSLY (nothing to order). Wait for the known large span (EDGE
  // long-run, >30 wd) so the sort operates on real values, then assert the column is
  // actually populated. Makes this pass STANDALONE cold, not only warm in the sweep.
  await realFrame!.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('[data-testid="table-row"]'));
    return els.filter((el) => { const d = el.getAttribute("data-row-duration"); return d != null && d !== ""; }).length >= 30;
  }, undefined, { timeout: 90_000 });
  await clickHeader("duration");
  const durDir = await sortDir("duration");
  const dur = (await rows("data-row-duration")).map((r) => r.v || "");
  console.log(`DURATION ${durDir} (first 8):`, JSON.stringify(dur.slice(0, 8)));
  expect((await rows("data-row-key")).length, "numeric sort keeps every row").toBe(baseCount);
  const nDur = assertMonotonic(dur, durDir as "asc" | "desc", "duration", true);
  expect(nDur, "the Duration column has real normalized values (not the empty cold state)").toBeGreaterThan(20);
});
