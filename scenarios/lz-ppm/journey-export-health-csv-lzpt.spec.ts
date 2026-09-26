// PERSISTENT feature journey — Dashboard "Health report" CSV EXPORT on LZPT (read-only).
// REWRITTEN 2026-09-26 for B-4 / B-63 (deployed dev 7.19.0). The export (healthReportToCsv) writes
// the dashboard's computed per-issue analytics — riskScore + riskBand from computeRiskScores — so its
// band distribution must equal the Schedule-risk card's, which since B-4 is:
//   red == open leaves past their date · amber == 0 on LZPT (oracle-proven) · green == the rest.
// Every scored row's band must agree with its score (>=60 red / >=30 amber / else green), and every
// red row must be a ticket past its date in Jira. Expectations come from Jira (lzptOracle).
// Non-mutating (a client-side Blob download; never Applies).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { lzptOracle, openLzptDashboard } from "./lzpt-risk-oracle";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 0, timeout: 240_000 });

test("LZPT Dashboard: Health-report CSV bands == the risk card (red == overdue)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");

  const exp = await lzptOracle(page);
  console.log("ORACLE:", JSON.stringify(exp));
  expect(exp.ampleAmber, "no non-overdue leaf can reach amber on LZPT").toBe(0);

  await openLzptDashboard(page, frame);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    frame.getByRole("button", { name: /Health report/i }).first().dispatchEvent("click"),
  ]);
  const path = await download.path();
  expect(path, "download captured").toBeTruthy();
  const csv = fs.readFileSync(path!, "utf8").replace(/^﻿/, "");
  const lines = csv.split(/\r?\n/).filter((l) => l.length);
  const header = splitCsv(lines[0]);
  console.log("CSV lines:", lines.length, " header:", header.join(","));
  const bandIdx = header.indexOf("riskBand"), scoreIdx = header.indexOf("riskScore"), keyIdx = header.findIndex((h) => /^(key|issueKey)$/i.test(h));
  expect(bandIdx, "riskBand column present").toBeGreaterThanOrEqual(0);
  expect(scoreIdx, "riskScore column present").toBeGreaterThanOrEqual(0);
  expect(keyIdx, "key column present").toBeGreaterThanOrEqual(0);

  const dist: Record<string, number> = { red: 0, amber: 0, green: 0 };
  let inconsistent = 0, redNotOverdue: string[] = [];
  const overdue = new Set(exp.overdueKeys);
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const band = cells[bandIdx];
    if (!band) continue; // parents carry no risk entry
    if (band in dist) dist[band] += 1;
    const score = Number(cells[scoreIdx]);
    const expBand = score >= 60 ? "red" : score >= 30 ? "amber" : "green";
    if (expBand !== band) inconsistent += 1;
    if (band === "red" && !overdue.has(cells[keyIdx])) redNotOverdue.push(cells[keyIdx]);
  }
  console.log("CSV dist:", JSON.stringify(dist), " inconsistent:", inconsistent, " redNotOverdue:", redNotOverdue.join(" "));
  expect(dist.red, "red rows == open tickets past their date").toBe(exp.overdue);
  expect(dist.amber, "amber rows == 0").toBe(0);
  expect(dist.green, "green rows == the other leaves").toBe(exp.leaves - exp.overdue);
  expect(redNotOverdue, "every red row is a ticket past its date").toEqual([]);
  expect(inconsistent, "every row's band matches its score").toBe(0);
});

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
