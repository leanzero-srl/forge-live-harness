// PERSISTENT feature journey — Dashboard RISK-BUCKET PARTITION accuracy on LZPT
// (read-only). The three risk KPI tiles (Overdue / At risk / On track) must form a
// COMPLETE, DISJOINT partition of the OPEN-LEAF set: every open leaf lands in exactly
// one bucket, no issue lost or double-counted. Verified against an INDEPENDENT
// computation over the seeded data (leaves = issues not referenced as a parent; open =
// not Done; overdue = due < today, at-risk = today <= due <= today+5, on-track = due >
// today+5 OR no due). LZPT dates are all in the past, so the partition is the strong
// invariant here: Overdue == all open dated leaves, At risk == 0, On track == the one
// unscheduled open leaf, and Overdue+AtRisk+OnTrack == the open-leaf count exactly.
// Also drills On-track → the drilled set == the computed on-track set. Non-mutating.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Dashboard: risk tiles PARTITION the open-leaf set (Overdue+AtRisk+OnTrack, computed)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // INDEPENDENT partition of the OPEN-LEAF set from Jira, mirroring computePlanMetrics:
  //   leaves    = issues NOT referenced as a parent
  //   open      = leaf AND statusCategory != 'done'
  //   overdue   = open AND dueUTC <  todayUTC
  //   at-risk   = open AND todayUTC <= dueUTC <= todayUTC + 5 days
  //   on-track  = open AND (no due date OR dueUTC > todayUTC + 5 days)
  const part = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary", "status", "duedate", "parent"] }) });
    const d = await res.json();
    const issues = d.issues || [];
    const parentKeys = new Set(issues.map((i: any) => i.fields.parent?.key).filter(Boolean));
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const DAY = 86400000;
    const overdue: string[] = [], atRisk: string[] = [], onTrack: string[] = [];
    for (const i of issues) {
      if (parentKeys.has(i.key)) continue;                        // parents excluded (leaves only)
      if (i.fields.status?.statusCategory?.key === "done") continue; // open leaves only
      const due = i.fields.duedate;
      if (!due) { onTrack.push(i.key); continue; }                // no due date → on-track
      const p = due.split("-").map(Number);
      const dueUTC = Date.UTC(p[0], p[1] - 1, p[2]);
      const days = Math.round((dueUTC - today) / DAY);
      if (days < 0) overdue.push(i.key);
      else if (days <= 5) atRisk.push(i.key);
      else onTrack.push(i.key);
    }
    const openLeaves = overdue.length + atRisk.length + onTrack.length;
    return { overdue: overdue.sort(), atRisk: atRisk.sort(), onTrack: onTrack.sort(), openLeaves };
  });
  console.log("COMPUTED partition:", JSON.stringify({ overdue: part.overdue.length, atRisk: part.atRisk.length, onTrack: part.onTrack.length, openLeaves: part.openLeaves }));

  // The buckets are disjoint by construction (a leaf is pushed to exactly one). Assert
  // the seed shape: all dates in the past → everything open+dated is overdue, at-risk
  // empty, on-track is the single unscheduled leaf. (Drift detector: a stray future-dated
  // probe issue would break these.)
  expect(part.overdue.length, "seeded LZPT overdue open leaves").toBe(30);
  expect(part.atRisk.length, "no open leaf is within today..+5 (all LZPT dates are in the past)").toBe(0);
  expect(part.onTrack.length, "exactly the one unscheduled open leaf is on-track").toBe(1);
  expect(part.openLeaves, "open-leaf total (37 leaves - 6 Done)").toBe(31);
  // no key appears in two buckets
  const union = [...part.overdue, ...part.atRisk, ...part.onTrack];
  expect(new Set(union).size, "buckets are pairwise disjoint").toBe(union.length);

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // Read the three risk-tile values straight from the DOM.
  const tiles = await realFrame!.evaluate(() => {
    const val = (label: string) => { const el = document.querySelector(`[data-testid="kpi-tile"][data-label="${label}"]`); return el ? Number(el.getAttribute("data-value")) : null; };
    return { overdue: val("Overdue"), atRisk: val("At risk"), onTrack: val("On track") };
  });
  console.log("TILES:", JSON.stringify(tiles));

  // ACCURACY: each tile == the independently-computed bucket size.
  expect(tiles.overdue, "Overdue tile == computed overdue").toBe(part.overdue.length);
  expect(tiles.atRisk, "At risk tile == computed at-risk").toBe(part.atRisk.length);
  expect(tiles.onTrack, "On track tile == computed on-track").toBe(part.onTrack.length);

  // PARTITION invariant across the tiles: the three risk buckets sum to the open-leaf set.
  expect((tiles.overdue || 0) + (tiles.atRisk || 0) + (tiles.onTrack || 0), "risk tiles partition the open-leaf set exactly").toBe(part.openLeaves);

  // Drill On-track (the only non-zero non-overdue bucket) → drilled set == computed on-track set.
  await frame.locator('[data-testid="kpi-tile"][data-label="On track"]').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const drilled: string[] = await realFrame!.evaluate(() => Array.from(document.querySelectorAll('[data-testid="drill-row"]')).map((el) => el.getAttribute("data-key")!).sort());
  console.log("ON_TRACK_DRILLED:", drilled.length, JSON.stringify(drilled));
  expect(new Set(drilled), "On-track drill lists EXACTLY the computed on-track leaves").toEqual(new Set(part.onTrack));
});
