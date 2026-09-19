// SCRATCH 6.70.0 — item 5: the naming bar with the plan's LETTERHEAD present.
// Seeds THREE chains on WFH where EVERY summary carries a "[harness-test]" prefix
// (plus a second repeated boilerplate word so planStopWords has something to catch),
// one of which is deliberately MIXED-subject. The mixed chain must fall back to a
// deterministic FACT name (repaired: unnameableSegmentName); the two homogeneous
// ones must be named by the model. REST + hook only, no browser.
// Deletes every issue and the fixture plan in the -Z test.
import { test, expect } from "@playwright/test";
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import * as fs from "fs";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratchpad/live-6700";
const STATE = `${OUT}/naming-state.json`;
test.describe.configure({ retries: 0, timeout: 1_200_000, mode: "serial" });

// EVERY summary carries the same leading bracketed tag AND the same trailing
// boilerplate phrase — the exact shape the fix is about.
const PREFIX = "[harness-test]";
const A_SUBJ = (i: number) => `Payments gateway rollout step ${String(i + 1).padStart(2, "0")}`;
const B_SUBJ = [
  "Warehouse relabelling in Rotterdam",
  "Legal review of the vendor terms",
  "Server room UPS swap",
  "Recruit a data steward",
  "Translate the onboarding emails",
  "Retire the fax line",
  "Rebadge the company vehicles",
  "Archive the 2019 tape backups",
];
const C_SUBJ = (i: number) => `Tax residency filing part ${i + 1}`;

function dates(i: number) {
  const s = new Date(Date.UTC(2027, 0, 4) + i * 7 * 86400000);
  const e = new Date(s.getTime() + 4 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(s), due: iso(e) };
}

test("NB-A seed three [harness-test]-prefixed chains (8 homogeneous / 8 mixed / 6)", async () => {
  const tag = `NB-${Date.now().toString(36)}`;
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const mk = async (summaries: string[]) => {
    const keys: string[] = [];
    for (const s of summaries) {
      const j: any = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `${PREFIX} ${tag} ${s}` });
      keys.push(j.key);
    }
    for (let i = 0; i < keys.length; i++) await setDates(keys[i], { ...dates(i), duration: undefined, buffer: undefined } as any, fc);
    for (let i = 1; i < keys.length; i++) await linkBlocks(keys[i - 1], keys[i]);
    return keys;
  };
  const A = await mk(Array.from({ length: 8 }, (_, i) => A_SUBJ(i)));
  const B = await mk(B_SUBJ);
  const C = await mk(Array.from({ length: 6 }, (_, i) => C_SUBJ(i)));
  const all = [...A, ...B, ...C];
  const jql = `key in (${all.join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 100);
    if (new Set(found.map((i: any) => i.key)).size < all.length) return false;
    for (const grp of [A, B, C]) for (let i = 0; i < grp.length; i++) {
      const issue: any = await get(`/rest/api/3/issue/${grp[i]}?fields=issuelinks`);
      const want = (i > 0 ? 1 : 0) + (i < grp.length - 1 ? 1 : 0);
      if ((issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length < want) return false;
    }
    return true;
  }, { timeout: 240_000, interval: 3_000, label: "naming-boilerplate seed propagation" });
  const planName = `${PREFIX} ${tag} boilerplate naming`;
  const cf: any = await getTestState("lz-ppm", { what: "createFixture", name: planName, jql });
  const summaries: Record<string, string> = {};
  A.forEach((k, i) => { summaries[k] = A_SUBJ(i); });
  B.forEach((k, i) => { summaries[k] = B_SUBJ[i]; });
  C.forEach((k, i) => { summaries[k] = C_SUBJ(i); });
  fs.writeFileSync(STATE, JSON.stringify({ tag, A, B, C, all, planId: cf.planId, planName, jql, summaries }, null, 2));
  console.log("SEEDED plan", cf.planId, "issues", cf.issues ?? cf.issueCount);
  console.log("A(homogeneous,8):", A.join(","));
  console.log("B(MIXED,8):", B.join(","));
  console.log("C(homogeneous,6):", C.join(","));
  expect(cf.planId).toBeTruthy();
});

test("NB-B one REAL build: the mixed chain must fall back to a fact name", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const r: any = await getTestState("lz-ppm", { what: "aiGroup", planId: st.planId, dry: "0" });
  fs.writeFileSync(`${OUT}/naming-aigroup.json`, JSON.stringify(r, null, 2));
  console.log("STRATEGY:", r.strategy, "| calls:", r.calls, "| partial:", r.partial, r.partialReason || "");
  console.log("SEGMENTS:");
  for (const s of r.segments || []) console.log(`  ${s.id} kind=${s.kind} n=${s.n} named=${s.named} name="${s.name}" chainId=${s.chainId}`);
  console.log("REPAIRED:", JSON.stringify(r.repaired, null, 1));
  console.log("UNNAMED SEGMENTS:", r.unnamedSegments, "| unnamed issues:", r.unnamedIssues);
  expect(r.calls).toBeGreaterThan(0);
});

test("NB-Z delete the fixture plan and every seeded issue", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const del: any = await getTestState("lz-ppm", { what: "deleteFixture", planId: st.planId });
  console.log("PLAN DELETED:", JSON.stringify(del));
  let gone = 0;
  for (const k of st.all) { try { await deleteIssue(k); gone++; } catch (e) { console.log("delete failed", k, String(e).slice(0, 80)); } }
  console.log(`ISSUES DELETED: ${gone}/${st.all.length}`);
  const left = await searchJql(`project = ${PROJECT} AND summary ~ "${st.tag}"`, ["summary"], 100).catch(() => []);
  console.log("LEFTOVER:", left.length);
  const plans: any = await getTestState("lz-ppm", { what: "plans" });
  console.log("PLAN STILL_EXISTS:", (plans.plans || []).some((p: any) => p.id === st.planId));
  expect((plans.plans || []).some((p: any) => p.id === st.planId)).toBe(false);
});
