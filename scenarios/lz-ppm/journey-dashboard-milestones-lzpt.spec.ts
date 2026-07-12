// PERSISTENT feature journey — Dashboard MILESTONE TRACKER accuracy on LZPT (read-only).
// The tracker lists every single-day, non-buffer LEAF (start == due) as a milestone, and
// labels each with a state that uses BOTH status category AND the date:
//   done → 'done';  else past due → 'missed';  else <=5 days out → 'at-risk';  else 'on-track'.
// Verified against an INDEPENDENT computation over the seeded data (dates + status category
// from Jira). LZPT seeds 11 single-day leaves: WIDE-01..10 (E6 children, start==due) + the
// "EDGE milestone (0-day)" task. W01/W02/W03 are Done → 'done'; the other 8 open ones are all
// past → 'missed'. Multi-day tasks (CHAIN 5d, DIAMOND, EDGE long-run) must NOT be milestones.
// Date-ONLY (no working-day / calendar / normalized-duration dependency → cold-robust).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Dashboard: milestone tracker == single-day non-buffer leaves + correct state", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // INDEPENDENT truth from Jira: single-day leaves (start==due) + their expected state.
  // (Buffers are excluded by the app, but LZPT seeds none, so leaf+single-day is exact.)
  const exp = await page.evaluate(async () => {
    const START = "customfield_10015"; // Jira "Start date" field (matches the LZPT seeder)
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary", "status", START, "duedate", "parent"] }) });
    const d = await res.json();
    const issues = d.issues || [];
    const parentSet = new Set(issues.map((i: any) => i.fields.parent?.key).filter(Boolean));
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const stateOf: Record<string, string> = {};
    const keys: string[] = [];
    for (const i of issues) {
      if (parentSet.has(i.key)) continue;                       // leaves only
      const start = i.fields[START] || i.fields.startdate;
      const due = i.fields.duedate;
      if (!start || !due || start !== due) continue;            // single-day only (start == due)
      keys.push(i.key);
      const cat = i.fields.status?.statusCategory?.key;
      if (cat === "done") { stateOf[i.key] = "done"; continue; }
      const p = due.split("-").map(Number);
      const days = Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - today) / 86400000);
      stateOf[i.key] = days < 0 ? "missed" : days <= 5 ? "at-risk" : "on-track";
    }
    return { keys: keys.sort(), stateOf };
  });
  console.log("COMPUTED milestones:", exp.keys.length, JSON.stringify(exp.keys));
  const expByState = exp.keys.reduce((a: Record<string, number>, k) => { a[exp.stateOf[k]] = (a[exp.stateOf[k]] || 0) + 1; return a; }, {});
  console.log("COMPUTED state split:", JSON.stringify(expByState));
  expect(exp.keys.length, "LZPT seeds 11 single-day leaves (WIDE-01..10 + EDGE milestone)").toBe(11);
  expect(expByState.done, "3 Done single-day leaves (WIDE-01/02/03)").toBe(3);
  expect(expByState.missed, "8 open single-day leaves, all past due").toBe(8);

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // Read the milestone tracker rows.
  await realFrame!.waitForFunction(() => document.querySelectorAll('[data-testid="milestone-row"]').length > 0, { timeout: 15_000 }).catch(() => {});
  const rows: Array<{ key: string; state: string }> = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="milestone-row"]')).map((el) => ({ key: el.getAttribute("data-key")!, state: el.getAttribute("data-state")! }))
  );
  const rowKeys = rows.map((r) => r.key).sort();
  const rowStateOf: Record<string, string> = {}; for (const r of rows) rowStateOf[r.key] = r.state;
  console.log("TRACKER rows:", rows.length, JSON.stringify(rowKeys));

  // ACCURACY 1: the milestone SET == exactly the computed single-day-leaf set (no multi-day
  // task leaks in, no single-day leaf is missed).
  expect(new Set(rowKeys), "tracker lists EXACTLY the single-day non-buffer leaves").toEqual(new Set(exp.keys));

  // ACCURACY 2: each milestone's STATE label == the computed state (category + date logic).
  for (const k of exp.keys) {
    expect(rowStateOf[k], `milestone ${k} state label`).toBe(exp.stateOf[k]);
  }

  // And the state split matches (3 done, 8 missed).
  const gotByState = rowKeys.reduce((a: Record<string, number>, k) => { a[rowStateOf[k]] = (a[rowStateOf[k]] || 0) + 1; return a; }, {});
  console.log("TRACKER state split:", JSON.stringify(gotByState));
  expect(gotByState).toEqual(expByState);
});
