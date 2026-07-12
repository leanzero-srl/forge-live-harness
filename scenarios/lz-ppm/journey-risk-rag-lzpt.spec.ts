// PERSISTENT feature journey — Dashboard SCHEDULE-RISK RAG distribution on LZPT (read-only).
// computeRiskScores gives each leaf a score = slip*4 + depth*3 + (overdue?30:atRisk?15:0) +
// depletion*25, banded red>=60 / amber>=30 / green<30. On LZPT slip=0 (no baseline) and
// depletion=0 (no buffers), so score = depth*3 + overdue-bump. Therefore, WITHOUT replicating
// the exact depth, the RAG counts are date-derivable:
//   • every OVERDUE open leaf scores depth*3 + 30 ∈ [30, ~45] → AMBER (never red: max depth ~5
//     → max ~45 < 60), so amber == the overdue-open-leaf count (30);
//   • done leaves and the single unscheduled open leaf score ~0 → GREEN (7 = 6 done + 1);
//   • red == 0.
// So the distribution is {red:0, amber:30, green:7} summing to the 37 leaves. Also checks each
// listed top-risk item's band matches its score (band thresholds). Non-mutating; never Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Dashboard: schedule-risk RAG == {red:0, amber:overdue(30), green:7} (computed)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // Independent, date-based expectation over leaves: overdue → amber, done/unscheduled → green.
  const exp = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["status", "duedate", "parent"] }) });
    const d = await res.json();
    const issues = d.issues || [];
    const parentSet = new Set(issues.map((i: any) => i.fields.parent?.key).filter(Boolean));
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let leaves = 0, overdue = 0, done = 0, openNonOverdue = 0;
    for (const i of issues) {
      if (parentSet.has(i.key)) continue;
      leaves += 1;
      const isDone = i.fields.status?.statusCategory?.key === "done";
      if (isDone) { done += 1; continue; }
      const due = i.fields.duedate;
      let isOverdue = false;
      if (due) { const p = due.split("-").map(Number); isOverdue = Date.UTC(p[0], p[1] - 1, p[2]) < today; }
      if (isOverdue) overdue += 1; else openNonOverdue += 1;
    }
    return { leaves, overdue, done, openNonOverdue };
  });
  console.log("EXP:", JSON.stringify(exp));
  expect(exp.leaves, "37 leaves").toBe(37);
  expect(exp.overdue, "30 overdue").toBe(30);
  // amber = overdue leaves; green = done + open-non-overdue (atRisk=0 on LZPT, all dates past); red = 0.
  const expAmber = exp.overdue;                    // 30
  const expGreen = exp.done + exp.openNonOverdue;  // 6 + 1 = 7
  expect(expAmber + expGreen, "amber+green == leaf count (red=0)").toBe(exp.leaves);

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  await realFrame!.waitForFunction(() => !!document.querySelector('[data-testid="risk-rag"]'), undefined, { timeout: 15_000 }).catch(() => {});
  const rag = await realFrame!.evaluate(() => {
    const el = document.querySelector('[data-testid="risk-rag"]');
    if (!el) return null;
    const n = (a: string) => Number(el.getAttribute(a));
    return { red: n("data-red"), amber: n("data-amber"), green: n("data-green") };
  });
  console.log("RAG:", JSON.stringify(rag));
  expect(rag, "schedule-risk RAG rendered").not.toBeNull();

  // ACCURACY: the RAG distribution == the date-derived expectation.
  expect(rag!.red, "red == 0 (no leaf scores >=60: max depth*3+30 ~45)").toBe(0);
  expect(rag!.amber, "amber == overdue open leaves (each scores 30..45)").toBe(expAmber);
  expect(rag!.green, "green == done + unscheduled leaves").toBe(expGreen);
  expect(rag!.red + rag!.amber + rag!.green, "RAG partitions the 37 leaves").toBe(exp.leaves);

  // Each listed top-risk item's band matches its score by the same thresholds.
  const items: Array<{ key: string; score: number; band: string }> = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="risk-item"]')).map((el) => ({ key: el.getAttribute("data-key")!, score: Number(el.getAttribute("data-score")), band: el.getAttribute("data-band")! }))
  );
  console.log("TOP items:", items.length, JSON.stringify(items.slice(0, 6)));
  expect(items.length, "top-risk list is populated").toBeGreaterThan(0);
  for (const it of items) {
    const expBand = it.score >= 60 ? "red" : it.score >= 30 ? "amber" : "green";
    expect(it.band, `${it.key} band matches its score ${it.score}`).toBe(expBand);
  }
});
