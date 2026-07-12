// PERSISTENT feature journey — Dashboard OVERDUE drill-down ACCURACY on LZPT
// (read-only). Click the Overdue KPI tile and assert the drilled issue set == an
// INDEPENDENT computation of "open leaf with a due date in the past" over the seeded
// data (LZPT dates are all < today, so every open scheduled leaf is overdue). The
// tile value == the drilled count == the computed count. Non-mutating. NEVER Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Dashboard: Overdue drill-down == the open-past-due leaf set (computed)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // INDEPENDENT computation from Jira: leaves = issues NOT referenced as a parent;
  // overdue = leaf, not Done, with a due date strictly before today (UTC date).
  const expected: string[] = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary", "status", "duedate", "parent"] }) });
    const d = await res.json();
    const issues = d.issues || [];
    const parentKeys = new Set(issues.map((i: any) => i.fields.parent?.key).filter(Boolean));
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const out: string[] = [];
    for (const i of issues) {
      if (parentKeys.has(i.key)) continue;                       // parents excluded (leaves only)
      const cat = i.fields.status?.statusCategory?.key;
      if (cat === "done") continue;                               // done issues aren't overdue
      const due = i.fields.duedate;
      if (!due) continue;                                          // no due date → not overdue (on-track)
      const p = due.split("-").map(Number);
      const dueUTC = Date.UTC(p[0], p[1] - 1, p[2]);
      if (dueUTC < today) out.push(i.key);                        // strictly before today → overdue
    }
    return out.sort();
  });
  console.log("COMPUTED_OVERDUE:", expected.length, JSON.stringify(expected.slice(0, 10)));
  expect(expected.length, "seeded LZPT has overdue open leaves (all dates are in the past)").toBeGreaterThan(5);

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // The Overdue KPI tile value.
  const tileVal = await realFrame!.evaluate(() => { const el = document.querySelector('[data-testid="kpi-tile"][data-label="Overdue"]'); return el ? Number(el.getAttribute("data-value")) : null; });
  console.log("OVERDUE_TILE_VALUE:", tileVal);
  expect(tileVal, "Overdue tile value == computed overdue count").toBe(expected.length);

  // Click the Overdue tile → drill-down.
  await frame.locator('[data-testid="kpi-tile"][data-label="Overdue"]').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const drilled: string[] = await realFrame!.evaluate(() => Array.from(document.querySelectorAll('[data-testid="drill-row"]')).map((el) => el.getAttribute("data-key")!).sort());
  console.log("DRILLED:", drilled.length, JSON.stringify(drilled.slice(0, 10)));

  // ACCURACY: the drilled set == exactly the computed overdue leaf set.
  expect(new Set(drilled), "drill-down lists EXACTLY the computed overdue leaves").toEqual(new Set(expected));
  expect(drilled.length, "drilled count == tile value").toBe(tileVal);
});
