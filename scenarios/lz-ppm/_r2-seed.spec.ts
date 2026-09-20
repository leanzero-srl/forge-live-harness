// ROUND-2 verification bed: three chains + five unscoped gates in WFH.
//   P = 16 homogeneous "Payments gateway — step NN"      (starts in the PAST -> late)
//   M = 8  deliberately MIXED subjects
//   W = 6  homogeneous "Warehouse relabelling — step NN"
// Plan finish lands BEFORE the latest gate, three gates are already past.
// Writes only [harness-test]-tagged WFH issues. Deleted by _r2-cleanup.
import { test, expect } from "../../fixtures/forge";
import { createIssue, setDates, linkBlocks } from "../../data/jira-build.mjs";
// @ts-ignore
import { get, searchJql, request as jiraRequest } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import * as fs from "fs";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const STATE = `${SHOT}/bed.json`;
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

const P = Array.from({ length: 16 }, (_, i) => `Payments gateway — step ${String(i + 1).padStart(2, "0")}`);
const M = [
  "Payroll tax table update for the new bands",
  "Warehouse robot firmware rollback switch",
  "Push notification opt-in screen on Android",
  "SSO signing certificate rotation",
  "PDF export embeds the wrong font",
  "DNS migration for the marketing domain",
  "Reception kiosk touchscreen calibration",
  "Lift telemetry feed drops overnight",
];
const W = Array.from({ length: 6 }, (_, i) => `Warehouse relabelling — step ${String(i + 1).padStart(2, "0")}`);

function dates(monday: string, i: number) {
  const s = new Date(Date.parse(monday + "T00:00:00Z") + i * 7 * 86400000);
  const e = new Date(s.getTime() + 4 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(s), due: iso(e) };
}

test("R2-SEED three chains + fixture plan + five unscoped gates", async () => {
  const tag = `R2-${Date.now().toString(36)}`;
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const mk = async (names: string[], prefix: string) => {
    const keys: string[] = [];
    for (let i = 0; i < names.length; i++) {
      const j: any = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `[harness-test] ${tag} ${prefix}${String(i + 1).padStart(2, "0")} ${names[i]}` });
      keys.push(j.key);
    }
    return keys;
  };
  const p = await mk(P, "P");
  const m = await mk(M, "M");
  const w = await mk(W, "W");
  for (let i = 0; i < p.length; i++) await setDates(p[i], dates("2026-06-01", i) as any, fc);
  for (let i = 0; i < m.length; i++) await setDates(m[i], dates("2026-09-21", i) as any, fc);
  for (let i = 0; i < w.length; i++) await setDates(w[i], dates("2026-10-05", i) as any, fc);
  for (const chain of [p, m, w]) for (let i = 1; i < chain.length; i++) await linkBlocks(chain[i - 1], chain[i]);
  const all = [...p, ...m, ...w];
  const jql = `key in (${all.join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 100);
    if (new Set(found.map((i: any) => i.key)).size < all.length) return false;
    for (const chain of [p, m, w]) for (let i = 0; i < chain.length; i++) {
      const issue: any = await get(`/rest/api/3/issue/${chain[i]}?fields=issuelinks`);
      const want = (i > 0 ? 1 : 0) + (i < chain.length - 1 ? 1 : 0);
      if ((issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length < want) return false;
    }
    return true;
  }, { timeout: 300_000, interval: 3_000, label: "r2 propagation" });
  const planName = `[harness-test] ${tag} three chains five gates`;
  const cf: any = await getTestState("lz-ppm", { what: "createFixture", name: planName, jql });
  fs.writeFileSync(STATE, JSON.stringify({ tag, p, m, w, all, planId: cf.planId, jql, planName }, null, 2));
  console.log("SEEDED", cf.planId, planName, "issues", all.length);
  expect(cf.planId).toBeTruthy();
});
