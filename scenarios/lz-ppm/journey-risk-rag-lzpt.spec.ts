// PERSISTENT feature journey — Dashboard SCHEDULE-RISK distribution on LZPT (read-only).
// REWRITTEN 2026-09-26 for B-4 / B-63 (deployed dev 7.19.0): an open ticket already past its date is
// RED ("High") and leads the list. computeRiskScores now gives an overdue open leaf RISK_RED (60) +
// min(20, days late) + depth*3 (+ slip*4), so it can never fall below the red line; the old journey
// asserted the pre-fix bug (red 0, amber == overdue). Every expectation below comes from Jira via
// lzptOracle, never from the app:
//   • red   == open leaves past their due date (the Dashboard's Overdue population);
//   • amber == 0, and the oracle PROVES it can be: no non-overdue leaf reaches 30 (depth*3 + 15);
//   • green == every other leaf, and the three partition the plan's leaves;
//   • the top-risk list is all red, every entry is a ticket past its date, ordered by score.
// Non-mutating; never Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { lzptOracle, openLzptDashboard } from "./lzpt-risk-oracle";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 0, timeout: 240_000 });

test("LZPT Dashboard: schedule risk — every open ticket past its date is red and leads the list", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  const exp = await lzptOracle(page);
  console.log("ORACLE:", JSON.stringify(exp));
  expect(exp.overdue, "the bed has open tickets past their date (else this journey proves nothing)").toBeGreaterThan(0);
  expect(exp.ampleAmber, "no non-overdue leaf can reach amber on LZPT (depth*3 + 15 < 30)").toBe(0);

  await openLzptDashboard(page, frame);
  await realFrame!.waitForFunction(() => !!document.querySelector('[data-testid="risk-rag"]'), undefined, { timeout: 30_000 }).catch(() => {});
  const rag = await realFrame!.evaluate(() => {
    const el = document.querySelector('[data-testid="risk-rag"]');
    if (!el) return null;
    const n = (a: string) => Number(el.getAttribute(a));
    return { red: n("data-red"), amber: n("data-amber"), green: n("data-green"), text: (el.textContent || "").replace(/\s+/g, " ") };
  });
  console.log("RAG:", JSON.stringify(rag));
  expect(rag, "schedule-risk card rendered").not.toBeNull();
  expect(rag!.red, "red (High) == open tickets past their date").toBe(exp.overdue);
  expect(rag!.amber, "amber (Medium) == 0").toBe(0);
  expect(rag!.green, "green (Low) == every other leaf").toBe(exp.leaves - exp.overdue);
  expect(rag!.red + rag!.amber + rag!.green, "the bands partition the plan's leaves").toBe(exp.leaves);
  expect(rag!.text, "the legend names the High count").toContain(`High ${exp.overdue}`);

  const items: Array<{ key: string; score: number; band: string }> = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="risk-item"]')).map((el) => ({ key: el.getAttribute("data-key")!, score: Number(el.getAttribute("data-score")), band: el.getAttribute("data-band")! }))
  );
  console.log("TOP:", JSON.stringify(items));
  expect(items.length, "top-risk list shows min(6, overdue) tickets").toBe(Math.min(6, exp.overdue));
  const overdue = new Set(exp.overdueKeys);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    expect(it.band, `${it.key} is red`).toBe("red");
    expect(it.score, `${it.key} scores at or above the red line`).toBeGreaterThanOrEqual(60);
    expect(overdue.has(it.key), `${it.key} is a ticket past its date`).toBe(true);
    if (i > 0) expect(it.score, `list is ordered by score (${items[i - 1].key} ≥ ${it.key})`).toBeLessThanOrEqual(items[i - 1].score);
  }
});
