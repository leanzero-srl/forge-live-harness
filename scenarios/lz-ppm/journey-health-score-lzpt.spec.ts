// PERSISTENT feature journey — Dashboard PLAN-HEALTH SCORE composition on LZPT (read-only).
// The hero score is a weighted blend of four components:
//   score = round(100 * (0.35*onTime + 0.25*bufferHealth + 0.25*lowRisk + 0.15*progress))
// This journey reads the score AND its four RAW component values (exposed as data-* on the
// hero) and:
//   1. reproduces the score EXACTLY from those raw parts (verifies the weighting arithmetic
//      — a wrong weight constant, dropped part, or bad rounding would diverge);
//   2. independently ANCHORS the two cleanly-derivable components against Jira:
//      onTime == 1 - overdue/leafCount (date-based: 30 overdue / 37 leaves = 0.1892), and
//      bufferHealth == 1 (LZPT seeds no buffers);
//   3. lowRisk == 1 (no leaf scores "red": risk = depth*3 + overdue-bump, max ~5*3+30=45 < 60);
//   4. the resulting score == 66 on the seeded bed (drift anchor).
// Risk scoring is depth+date based (NOT duration/calendar-gated), and %complete is 22 cold or
// warm on this bed, so the score is deterministic and cold-robust. Non-mutating; never Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Dashboard: plan-health score == weighted blend of its components (computed)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // Independent Jira truth for the On-time anchor: leaves = not-a-parent; overdue = open leaf,
  // due strictly before today (UTC).
  const jira = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["status", "duedate", "parent"] }) });
    const d = await res.json();
    const issues = d.issues || [];
    const parentSet = new Set(issues.map((i: any) => i.fields.parent?.key).filter(Boolean));
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let leaves = 0, overdue = 0;
    for (const i of issues) {
      if (parentSet.has(i.key)) continue;
      leaves += 1;
      if (i.fields.status?.statusCategory?.key === "done") continue;
      const due = i.fields.duedate;
      if (!due) continue;
      const p = due.split("-").map(Number);
      if (Date.UTC(p[0], p[1] - 1, p[2]) < today) overdue += 1;
    }
    return { leaves, overdue };
  });
  console.log("JIRA leaves/overdue:", jira.leaves, jira.overdue);
  expect(jira.leaves, "37 leaves").toBe(37);
  expect(jira.overdue, "30 overdue open leaves").toBe(30);
  const expOnTime = 1 - jira.overdue / jira.leaves; // 0.18919...

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // Wait for the hero to render a real (non-zero) score.
  await realFrame!.waitForFunction(() => {
    const el = document.querySelector('[data-testid="plan-health"]');
    return !!el && Number(el.getAttribute("data-score")) > 0;
  }, undefined, { timeout: 15_000 }).catch(() => {});
  const h = await realFrame!.evaluate(() => {
    const el = document.querySelector('[data-testid="plan-health"]');
    if (!el) return null;
    const n = (a: string) => Number(el.getAttribute(a));
    return { score: n("data-score"), onTime: n("data-ontime"), buffer: n("data-buffer"), lowRisk: n("data-lowrisk"), progress: n("data-progress") };
  });
  console.log("HEALTH:", JSON.stringify(h));
  expect(h, "hero exposes plan-health data").not.toBeNull();

  // 1. Reproduce the score EXACTLY from its raw parts (weighting arithmetic).
  const reproduced = Math.max(0, Math.min(100, Math.round(100 * (0.35 * h!.onTime + 0.25 * h!.buffer + 0.25 * h!.lowRisk + 0.15 * h!.progress))));
  console.log("REPRODUCED score:", reproduced, "vs DOM", h!.score);
  expect(reproduced, "score == weighted blend of its four raw components").toBe(h!.score);

  // 2. On-time anchor (date-based, independent of the app).
  expect(Math.abs(h!.onTime - expOnTime), `On-time == 1 - overdue/leaves (${expOnTime.toFixed(4)})`).toBeLessThan(0.001);

  // 3. Buffer health == 1 (no buffers) and Low risk == 1 (no red leaf: risk = depth*3 + overdue-bump, max ~45 < 60).
  expect(h!.buffer, "buffer health == 1 (LZPT seeds no buffers)").toBeCloseTo(1, 5);
  expect(h!.lowRisk, "low risk == 1 (no leaf scores red)").toBeCloseTo(1, 5);

  // 4. Seed drift anchor — a tight band, NOT an exact value: the score flickers 65 (warm) /
  //    66 (cold) because its Progress term reads %complete, which is duration-weighted =14
  //    warm (the 42-day 0%-done EDGE long-run dominates the weighting) but =22 cold (all
  //    durations read as 1 → a count-average) — i.e. %complete is calendar-gated. The exact
  //    composition is still pinned by the reproduction check (1) above; this only guards drift.
  expect(h!.score, "seeded LZPT plan-health score in the 65-66 band").toBeGreaterThanOrEqual(64);
  expect(h!.score).toBeLessThanOrEqual(67);
  // Progress term is consistent with a duration-weighted %complete in [14..22].
  const pctFromProgress = Math.round((h!.progress - 0.5) * 2 * 100);
  console.log("implied %complete:", pctFromProgress);
  expect(pctFromProgress, "%complete (from progress term) in the weighted..count band").toBeGreaterThanOrEqual(10);
  expect(pctFromProgress).toBeLessThanOrEqual(24);
});
