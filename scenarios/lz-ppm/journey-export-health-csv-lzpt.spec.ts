// PERSISTENT feature journey — Dashboard "Health report" CSV EXPORT on LZPT (read-only).
// The export pipeline (healthReportToCsv) writes the dashboard's COMPUTED per-issue analytics
// — riskScore + riskBand (from computeRiskScores), buffer health, baseline slip — to a CSV.
// This journey captures the actual downloaded file and verifies its computed content:
//   • the riskBand column distribution == the schedule-risk RAG {red:0, amber:30, green:7}
//     (amber == the 30 overdue open leaves; done/unscheduled leaves green; none red);
//   • every scored row's band is consistent with its score (>=60 red / >=30 amber / else green);
//   • the max riskScore is ~45 (depth*3+30 for the deepest CHAIN leaf) and <60 (no red).
// Non-mutating (export is a client-side Blob download; never Applies).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Dashboard: Health-report CSV carries the computed risk analytics (RAG {0,30,7})", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");

  // Independent expectation (date-based): amber = overdue open leaves, green = done + open-non-overdue.
  const exp = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["status", "duedate", "parent"] }) });
    const d = await res.json();
    const issues = d.issues || [];
    const parentSet = new Set(issues.map((i: any) => i.fields.parent?.key).filter(Boolean));
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let amber = 0, green = 0;
    for (const i of issues) {
      if (parentSet.has(i.key)) continue;
      if (i.fields.status?.statusCategory?.key === "done") { green += 1; continue; }
      const due = i.fields.duedate;
      let overdue = false;
      if (due) { const p = due.split("-").map(Number); overdue = Date.UTC(p[0], p[1] - 1, p[2]) < today; }
      if (overdue) amber += 1; else green += 1;
    }
    return { amber, green };
  });
  console.log("EXP bands:", JSON.stringify(exp));
  expect(exp.amber, "30 overdue → amber").toBe(30);

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // Capture the CSV download triggered from inside the Forge iframe (page-level event).
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    frame.getByRole("button", { name: /Health report/i }).first().dispatchEvent("click"),
  ]);
  const path = await download.path();
  expect(path, "download captured").toBeTruthy();
  const csv = fs.readFileSync(path!, "utf8");
  const lines = csv.split(/\r?\n/).filter((l) => l.length);
  console.log("CSV lines:", lines.length, " header:", lines[0]);

  const header = lines[0].split(",");
  const bandIdx = header.indexOf("riskBand");
  const scoreIdx = header.indexOf("riskScore");
  expect(bandIdx, "riskBand column present").toBeGreaterThanOrEqual(0);
  expect(scoreIdx, "riskScore column present").toBeGreaterThanOrEqual(0);

  // Parse rows (handle quoted summaries: split on the FIRST/known columns is risky, so parse CSV simply
  // by taking the band/score columns which are unquoted trailing numeric/word fields).
  const dist: Record<string, number> = { red: 0, amber: 0, green: 0 };
  let maxScore = -1, inconsistent = 0, scored = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const band = cells[bandIdx];
    const scoreStr = cells[scoreIdx];
    if (!band) continue;                              // parents have no risk entry → blank
    scored += 1;
    if (band in dist) dist[band] += 1;
    const score = Number(scoreStr);
    if (!Number.isNaN(score)) {
      maxScore = Math.max(maxScore, score);
      const expBand = score >= 60 ? "red" : score >= 30 ? "amber" : "green";
      if (expBand !== band) inconsistent += 1;
    }
  }
  console.log("CSV dist:", JSON.stringify(dist), " scored:", scored, " maxScore:", maxScore, " inconsistent:", inconsistent);

  // ACCURACY: the exported risk bands match the computed RAG, and score↔band is consistent.
  expect(dist.red, "no red rows in the export").toBe(0);
  expect(dist.amber, "amber rows == overdue open leaves (30)").toBe(exp.amber);
  expect(dist.green, "green rows == done + non-overdue leaves").toBe(exp.green);
  expect(inconsistent, "every row's band matches its score by the thresholds").toBe(0);
  expect(maxScore, "deepest CHAIN leaf scores ~45 (depth*3+30)").toBeGreaterThanOrEqual(40);
  expect(maxScore, "no leaf reaches the red threshold").toBeLessThan(60);
});

// Minimal CSV field splitter honoring double-quoted fields with escaped quotes.
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
