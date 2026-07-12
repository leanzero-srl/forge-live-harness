// PERSISTENT feature journey — Dashboard "% Complete" DURATION-WEIGHTING on LZPT (read-only).
// The "Complete" KPI is a duration-WEIGHTED average of per-leaf status:
//   percentComplete = round( Σ pct[cat]·max(1,dur) / Σ max(1,dur) )  over leaves,
//   pct = {new:0, indeterminate:50, done:100}.
// This is the DISCRIMINATING test the earlier (cold) attempt couldn't be: on LZPT the
// duration-weighted average is ~14 (the 42-day, 0%-done "EDGE long-run" dominates Σdur and
// drags it far below the plain count-average ~22). So asserting tile == WEIGHTED and
// WEIGHTED != COUNT-AVG proves the app really weights by duration, not by issue count.
// Reads NORMALIZED per-leaf durations from the Table (calendar-gated → count-based settle +
// retries), status CATEGORY from Jira, computes the weighted average independently, then
// confirms the Dashboard "Complete" tile matches it. Non-mutating; never Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
// retries=2: reads calendar-gated normalized durations (Forge Lambda cold-start, high variance).
test.describe.configure({ retries: 2, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Dashboard: % Complete is DURATION-weighted (weighted 14 != count-avg 22), tile matches", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // Ground truth from Jira: leaf membership + each issue's status CATEGORY.
  const jira = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["status", "parent"] }) });
    const d = await res.json();
    const issues = d.issues || [];
    const parentSet = new Set(issues.map((i: any) => i.fields.parent?.key).filter(Boolean));
    const leaves: string[] = [];
    const cat: Record<string, string> = {};
    for (const i of issues) {
      cat[i.key] = i.fields.status?.statusCategory?.key || "new";
      if (!parentSet.has(i.key)) leaves.push(i.key);
    }
    return { leaves: leaves.sort(), cat };
  });
  expect(jira.leaves.length, "37 leaves").toBe(37);

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  // TABLE → wait for NORMALIZED durations (count-based settle), then read per-leaf duration.
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await realFrame!.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('[data-testid="table-row"]'));
    return els.filter((el) => { const d = el.getAttribute("data-row-duration"); return d != null && d !== ""; }).length >= 30;
  }, undefined, { timeout: 60_000 });
  const durByKey: Record<string, string> = await realFrame!.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of Array.from(document.querySelectorAll('[data-testid="table-row"]'))) out[el.getAttribute("data-row-key")!] = el.getAttribute("data-row-duration") || "";
    return out;
  });
  const tableLeaves = jira.leaves.filter((k) => k in durByKey);
  expect(new Set(tableLeaves), "all leaves have a Table row").toEqual(new Set(jira.leaves));

  // Independent duration-WEIGHTED %complete, and the plain COUNT-average, over leaves.
  const PCT: Record<string, number> = { new: 0, indeterminate: 50, done: 100 };
  let wNum = 0, wDen = 0, cNum = 0;
  for (const k of jira.leaves) {
    const dur = Math.max(1, Number(durByKey[k]) || 1);
    const pct = PCT[jira.cat[k]] ?? 0;
    wNum += pct * dur; wDen += dur; cNum += pct;
  }
  const weighted = wDen ? Math.round(wNum / wDen) : 0;
  const countAvg = Math.round(cNum / jira.leaves.length);
  console.log("WEIGHTED:", weighted, " COUNT-AVG:", countAvg, " Σdur:", wDen);
  // Guard: real normalized durations were used (not the all-1 cold state → Σdur >> leaf count).
  expect(wDen, "summed leaf duration reflects REAL normalized spans").toBeGreaterThan(120);
  // The DISCRIMINATING fact: weighting and counting DIVERGE on this bed (long 0%-done task).
  expect(Math.abs(weighted - countAvg), "duration-weighting diverges from the count-average").toBeGreaterThanOrEqual(4);
  expect(weighted, "weighted %complete ~14").toBeGreaterThanOrEqual(11);
  expect(weighted).toBeLessThanOrEqual(17);
  expect(countAvg, "count-average ~22").toBeGreaterThanOrEqual(20);

  // DASHBOARD → the "Complete" tile must equal the WEIGHTED value (not the count-average).
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const tile = await realFrame!.evaluate(() => { const el = document.querySelector('[data-testid="kpi-tile"][data-label="Complete"]'); return el ? Number(el.getAttribute("data-value")) : null; });
  console.log("COMPLETE_TILE:", tile);
  expect(tile, "Complete tile == duration-WEIGHTED avg (proves it is not count-weighted)").toBe(weighted);
});
