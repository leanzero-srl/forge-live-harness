// PERSISTENT feature journey — Dashboard PLAN-HEALTH hero on LZPT (read-only).
// REWRITTEN 2026-09-26 (B-63). The numeric health SCORE and its four data-* components were removed
// on 2026-09-19 (lz-ppm-forge 4a9a0cd7, "plan health is the LADDER's word"): the hero is now the
// verdict ladder's word plus a counts line and a commitment line. The old journey (score == weighted
// blend, "no red") could no longer run at all. What it asserts now, against Jira via lzptOracle:
//   • the counts line "N on track · M at risk · K overdue" — K == open leaves past their date,
//     M == open leaves due within 0..5 days, N == the remaining open leaves;
//   • the verdict word is the ladder's "Late" (tickets past their date, no plan target on LZPT) and
//     the commitment line names the same K;
//   • the hero's overdue K equals the Schedule-risk card's red count (the two readers of one rule).
// Non-mutating; never Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { lzptOracle, openLzptDashboard } from "./lzpt-risk-oracle";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 0, timeout: 240_000 });

test("LZPT Dashboard: plan-health hero counts and verdict agree with Jira and with the risk card", async ({ page }) => {
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
  await openLzptDashboard(page, frame);
  await realFrame!.waitForFunction(() => !!document.querySelector('[data-testid="plan-health"]'), undefined, { timeout: 30_000 }).catch(() => {});
  const h = await realFrame!.evaluate(() => {
    const el = document.querySelector('[data-testid="plan-health"]');
    if (!el) return null;
    const subs = Array.from(el.querySelectorAll(".lz-dash-hero-sub")).map((e) => (e.textContent || "").replace(/\s+/g, " ").trim());
    const rag = document.querySelector('[data-testid="risk-rag"]');
    return {
      verdict: el.getAttribute("data-verdict"),
      word: (el.querySelector('[data-testid="plan-health-verdict"]')?.textContent || "").trim(),
      counts: subs.find((t) => /on track/.test(t)) || null,
      commitment: (el.querySelector('[data-testid="plan-health-commitment"]')?.textContent || "").replace(/\s+/g, " ").trim(),
      red: rag ? Number(rag.getAttribute("data-red")) : null,
    };
  });
  console.log("HERO:", JSON.stringify(h));
  expect(h, "plan-health hero rendered").not.toBeNull();
  const onTrack = exp.openLeaves - exp.overdue - exp.atRisk;
  expect(h!.counts, "counts line == Jira").toBe(`${onTrack} on track · ${exp.atRisk} at risk · ${exp.overdue} overdue`);
  expect(h!.verdict, "LZPT (tickets past their date, no plan target) reads Late").toBe("late");
  expect(h!.word, "the ladder's word").toBe("Late");
  expect(h!.commitment, "the commitment line names the same overdue count").toContain(`${exp.overdue} ticket${exp.overdue === 1 ? " is" : "s are"} past their date`);
  expect(h!.red, "hero overdue == Schedule-risk red (one rule, two readers)").toBe(exp.overdue);
});
