// PM-CRITIC round 2 bed: three chains in WFH.
//   A = 18 tickets, ONE real shared subject (invoice reconciliation) -> nameable
//   B = 14 tickets, DELIBERATELY MIXED subjects -> the name-honesty test
//   C = 4 tickets  -> under the beat floor, must show as a SHORTER RUN
// Writes only [harness-test]-tagged WFH issues. Deleted by _critic2-cleanup.
import { test, expect } from "../../fixtures/forge";
import { createIssue, setDates, linkBlocks } from "../../data/jira-build.mjs";
// @ts-ignore
import { get, searchJql, request as jiraRequest } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import * as fs from "fs";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/critic2";
const STATE = `${SHOT}/bed.json`;
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

const A = [
  "Invoice reconciliation kick-off with finance",
  "Invoice reconciliation data model review",
  "Invoice matching rules for partial payments",
  "Invoice reconciliation import of legacy ledgers",
  "Invoice reconciliation exception queue",
  "Invoice reconciliation duplicate detection",
  "Invoice reconciliation currency rounding rules",
  "Invoice reconciliation approval workflow",
  "Invoice reconciliation audit trail",
  "Invoice reconciliation reporting screen",
  "Invoice reconciliation bulk write-off",
  "Invoice reconciliation supplier statement upload",
  "Invoice reconciliation performance tuning",
  "Invoice reconciliation permissions review",
  "Invoice reconciliation user acceptance testing",
  "Invoice reconciliation training material",
  "Invoice reconciliation cutover rehearsal",
  "Invoice reconciliation go live",
];
const B = [
  "Payroll tax table update for the new bands",
  "Warehouse robot firmware rollback switch",
  "Push notification opt-in screen on Android",
  "SSO signing certificate rotation",
  "PDF export embeds the wrong font",
  "Offline cache eviction on the field app",
  "Helpdesk macro library spring clean",
  "DNS migration for the marketing domain",
  "Backup retention policy for archived tenants",
  "Reception kiosk touchscreen calibration",
  "Badge printer driver upgrade",
  "Cafeteria menu API returns stale items",
  "Lift telemetry feed drops overnight",
  "Meeting room display firmware patch",
];
const C = [
  "Brand refresh of the login page",
  "Brand refresh of the email templates",
  "Brand refresh of the mobile splash",
  "Brand refresh sign-off",
];

// one 5-working-day task per week from a Monday
function dates(monday: string, i: number) {
  const s = new Date(Date.parse(monday + "T00:00:00Z") + i * 7 * 86400000);
  const e = new Date(s.getTime() + 4 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(s), due: iso(e) };
}

async function toDoneCategory(key: string) {
  for (let i = 0; i < 6; i++) {
    const cur: any = await get(`/rest/api/3/issue/${key}?fields=status`);
    if (cur.fields.status.statusCategory.key === "done") return cur.fields.status.name;
    const t: any = await get(`/rest/api/3/issue/${key}/transitions`);
    const d = t.transitions.find((x: any) => x.to?.statusCategory?.key === "done");
    if (!d) throw new Error(`no done transition from ${cur.fields.status.name} on ${key}`);
    await jiraRequest("POST", `/rest/api/3/issue/${key}/transitions`, { raw: true, body: { transition: { id: d.id } } });
  }
  throw new Error("no done status " + key);
}
async function toInProgress(key: string) {
  const t: any = await get(`/rest/api/3/issue/${key}/transitions`);
  const d = t.transitions.find((x: any) => x.to?.statusCategory?.key === "indeterminate");
  if (d) await jiraRequest("POST", `/rest/api/3/issue/${key}/transitions`, { raw: true, body: { transition: { id: d.id } } });
}

test("CRITIC2-SEED three chains + fixture plan", async () => {
  const tag = `C2-${Date.now().toString(36)}`;
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const mk = async (names: string[], prefix: string) => {
    const keys: string[] = [];
    for (let i = 0; i < names.length; i++) {
      const j: any = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `[harness-test] ${tag} ${prefix}${String(i + 1).padStart(2, "0")} ${names[i]}` });
      keys.push(j.key);
    }
    return keys;
  };
  const a = await mk(A, "A");
  const b = await mk(B, "B");
  const c = await mk(C, "C");
  // Chain A starts in the PAST so some of it is done and some of it is late.
  for (let i = 0; i < a.length; i++) await setDates(a[i], { ...dates("2026-08-03", i), duration: undefined, buffer: undefined } as any, fc);
  // Chain B ends LAST -> it holds the plan finish.
  for (let i = 0; i < b.length; i++) await setDates(b[i], { ...dates("2026-10-05", i), duration: undefined, buffer: undefined } as any, fc);
  for (let i = 0; i < c.length; i++) await setDates(c[i], { ...dates("2026-09-07", i), duration: undefined, buffer: undefined } as any, fc);
  for (const chain of [a, b, c]) for (let i = 1; i < chain.length; i++) await linkBlocks(chain[i - 1], chain[i]);
  for (const k of a.slice(0, 4)) console.log("DONE", k, await toDoneCategory(k));
  await toInProgress(a[4]);
  const all = [...a, ...b, ...c];
  const jql = `key in (${all.join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 100);
    if (new Set(found.map((i: any) => i.key)).size < all.length) return false;
    for (const chain of [a, b, c]) for (let i = 0; i < chain.length; i++) {
      const issue: any = await get(`/rest/api/3/issue/${chain[i]}?fields=issuelinks`);
      const want = (i > 0 ? 1 : 0) + (i < chain.length - 1 ? 1 : 0);
      if ((issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length < want) return false;
    }
    return true;
  }, { timeout: 240_000, interval: 3_000, label: "critic2 propagation" });
  const planName = `[harness-test] ${tag} three chains`;
  const cf: any = await getTestState("lz-ppm", { what: "createFixture", name: planName, jql });
  fs.writeFileSync(STATE, JSON.stringify({ tag, a, b, c, all, planId: cf.planId, jql, planName }, null, 2));
  console.log("SEEDED", cf.planId, planName);
  expect(cf.planId).toBeTruthy();
});
