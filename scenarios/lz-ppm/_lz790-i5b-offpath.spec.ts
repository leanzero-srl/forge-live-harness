// LZ790 item 5b — a CLEAN off-path toggle: X is already UNDATED in Jira and in the
// stored rows before this spec starts. Read the forecast, then restore X and read again.
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
  await page.waitForTimeout(9000);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  return frame;
}
async function forecast(frame: any, page: any) {
  const sc = frame.locator('[data-testid="schedule-confidence"]').first();
  for (let i = 0; i < 90; i++) { if (await sc.getAttribute("data-p50").catch(() => null)) break; await page.waitForTimeout(1000); }
  return { p50: await sc.getAttribute("data-p50"), p80: await sc.getAttribute("data-p80"), p90: await sc.getAttribute("data-p90"), runs: await sc.getAttribute("data-runs"), datedLeaves: await sc.getAttribute("data-leaves"), coverage: ((await frame.locator('[data-testid="sc-coverage-note"]').first().textContent().catch(() => "")) || "").trim(), hist: await frame.locator('[data-testid="sc-bar"]').evaluateAll((els: any[]) => els.map((e) => `${e.getAttribute("data-week")}:${e.getAttribute("data-count")}`).join(",")) };
}
const storedX = async () => { const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID }); const r = p.issues.find((i: any) => i.key === "WFH-3734"); return `${r.startDate}..${r.dueDate}`; };

test("I5b: off-path leaf undated -> dated, forecast identical", async ({ page }) => {
  // A DRAFT on the toggled row masks the Jira change entirely (cost one run).
  console.log("clearDrafts", JSON.stringify(await getTestState("lz-ppm", { what: "clearDrafts", planId: PLAN_ID })));
  await setFields("WFH-3734", { duedate: null, customfield_10015: null });
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 3000)); if ((await storedX()) === "null..null") break; }
  console.log("STORED X (expect null..null)", await storedX());
  await page.setViewportSize({ width: 1500, height: 1000 });
  await assertLoggedIn(page);
  let frame = await openDashboard(page);
  const undated = await forecast(frame, page);
  console.log("FORECAST_X_UNDATED", JSON.stringify(undated));
  await page.screenshot({ path: `${OUT}/i5b-01-undated.png`, fullPage: true });

  await setFields("WFH-3734", { duedate: "2026-10-09", customfield_10015: "2026-10-05" });
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(3000); if ((await storedX()) === "2026-10-05..2026-10-09") break; }
  console.log("STORED X after restore", await storedX());
  frame = await openDashboard(page);
  const dated = await forecast(frame, page);
  console.log("FORECAST_X_DATED", JSON.stringify(dated));
  await page.screenshot({ path: `${OUT}/i5b-02-dated.png`, fullPage: true });
  console.log("COVERAGE_CHANGED", undated.coverage !== dated.coverage, "| DATEDLEAVES", undated.datedLeaves, "->", dated.datedLeaves);
  console.log("P50/80/90 IDENTICAL", undated.p50 === dated.p50 && undated.p80 === dated.p80 && undated.p90 === dated.p90);
  console.log("HIST IDENTICAL", undated.hist === dated.hist);
});
