// LZ790 item 5 — forecast stability under an OFF-PATH leaf toggling dated<->undated,
// movement under an ON-PATH leaf, and the FinishSensitivity coverage sentence.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { setFields } from "../../data/jira-build.mjs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz790shots";
const PLAN = "LZ790 retest bed";
const PLAN_ID = "plan-test-muas0boj-ttkdmu";
test.describe.configure({ retries: 0, timeout: 1_800_000 });

async function openDashboard(page: any) {
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(7000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  return frame;
}
async function forecast(frame: any, page: any) {
  const sc = frame.locator('[data-testid="schedule-confidence"]').first();
  for (let i = 0; i < 90; i++) {
    const p50 = await sc.getAttribute("data-p50").catch(() => null);
    if (p50) break;
    await page.waitForTimeout(1000);
  }
  return {
    p50: await sc.getAttribute("data-p50"), p80: await sc.getAttribute("data-p80"), p90: await sc.getAttribute("data-p90"),
    runs: await sc.getAttribute("data-runs"), leaves: await sc.getAttribute("data-leaves"),
    uncertainty: await sc.getAttribute("data-uncertainty"), onBaseline: await sc.getAttribute("data-onbaseline"),
    coverage: ((await frame.locator('[data-testid="sc-coverage-note"]').first().textContent().catch(() => "")) || "").trim(),
    hist: await frame.locator('[data-testid="sc-bar"]').evaluateAll((els: any[]) => els.map((e) => `${e.getAttribute("data-week")}:${e.getAttribute("data-count")}`).join(",")),
  };
}

test("I5: forecast stable on an off-path leaf, moves on an on-path leaf; sensitivity coverage", async ({ page }) => {
  await getTestState("lz-ppm", { what: "refreshPlan", planId: PLAN_ID });
  await page.setViewportSize({ width: 1500, height: 1000 });
  await assertLoggedIn(page);
  let frame = await openDashboard(page);
  const f0 = await forecast(frame, page);
  console.log("FORECAST_BASE", JSON.stringify(f0));
  await page.screenshot({ path: `${OUT}/i5-00-base.png`, fullPage: true });

  // --- FinishSensitivity, with the one isolated undated leaf in the plan ---
  await frame.locator("button").filter({ hasText: /^Test finish sensitivity$/ }).first().dispatchEvent("click");
  for (let i = 0; i < 120; i++) { await page.waitForTimeout(1000); if (await frame.locator('[data-testid="fs-coverage-note"]').count()) break; }
  const fs = {
    note: ((await frame.locator('[data-testid="fs-coverage-note"]').first().textContent().catch(() => "")) || "").trim(),
    rows: await frame.locator('[data-testid="finish-effect"]').count(),
    section: ((await frame.locator('[data-testid="finish-sensitivity"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 700),
  };
  console.log("FS", JSON.stringify(fs, null, 1));
  console.log("FS_SAYS_UNAVAILABLE", /Unavailable:/.test(fs.section));
  await frame.locator('[data-testid="finish-sensitivity"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/i5-01-sensitivity.png`, fullPage: true });

  // --- OFF-PATH leaf X: dated -> undated ---
  await setFields("WFH-3734", { duedate: null, customfield_10015: null });
  console.log("X made UNDATED at", new Date().toISOString());
  await page.waitForTimeout(14000);
  frame = await openDashboard(page);
  const f1 = await forecast(frame, page);
  console.log("FORECAST_X_UNDATED", JSON.stringify(f1));
  await page.screenshot({ path: `${OUT}/i5-02-x-undated.png`, fullPage: true });

  // --- restore X ---
  await setFields("WFH-3734", { duedate: "2026-10-09", customfield_10015: "2026-10-05" });
  console.log("X RESTORED at", new Date().toISOString());
  await page.waitForTimeout(14000);
  frame = await openDashboard(page);
  const f2 = await forecast(frame, page);
  console.log("FORECAST_X_RESTORED", JSON.stringify(f2));

  // --- ON-PATH leaf C: move its due +5 working days ---
  await setFields("WFH-3731", { duedate: "2026-11-04" });
  console.log("C moved on-path at", new Date().toISOString());
  await page.waitForTimeout(14000);
  frame = await openDashboard(page);
  const f3 = await forecast(frame, page);
  console.log("FORECAST_C_MOVED", JSON.stringify(f3));
  await page.screenshot({ path: `${OUT}/i5-03-c-moved.png`, fullPage: true });

  console.log("STABLE_OFFPATH", f0.p50 === f1.p50 && f0.p80 === f1.p80 && f0.p90 === f1.p90);
  console.log("MOVED_ONPATH", f2.p50 !== f3.p50 || f2.p80 !== f3.p80 || f2.p90 !== f3.p90);
  // --- restore C ---
  await setFields("WFH-3731", { duedate: "2026-10-28" });
  console.log("C RESTORED at", new Date().toISOString());
});
