// TESTER (6.62.0, item 3): two engine shapes seeded LIVE on WFH.
//  A) TWO inherited edges closing a loop the DECLARED graph does not have:
//     P1(preds [X]) > {C1, Y};  P2(preds [Y]) > {X}
//  B) a 4-Epic chain E0>E1>E2>E3, 2 children each, Epic stored dues LATER than
//     the children — ONE settle must already be the joint fixed point.
// Writes ONLY [harness-test]-tagged issues; deletes everything unless KEEP=1.
import { test, expect } from "@playwright/test";
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { request, get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import * as fs from "fs";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const KEEP = process.env.KEEP === "1";
const STATE = process.env.STATE_FILE || "/tmp/lz-6620-seed.json";
test.describe.configure({ retries: 0, timeout: 900_000 });

type Spec = { id: string; epic: boolean; parent?: string; start?: string; due?: string; preds?: string[] };

async function seed(tag: string, specs: Spec[]) {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const map: Record<string, string> = {};
  const created: string[] = [];
  for (const s of specs) {
    const j = await createIssue({ projectKey: PROJECT, issueType: s.epic ? "Epic" : "Work package", summary: `[harness-test] ${tag} ${s.id}` });
    map[s.id] = j.key; created.push(j.key);
  }
  for (const s of specs) if (s.start || s.due) await setDates(map[s.id], { start: s.start, due: s.due }, fc);
  for (const s of specs) for (const p of s.preds || []) await linkBlocks(map[p], map[s.id]);
  for (const s of specs) if (s.parent) await request("PUT", `/rest/api/3/issue/${map[s.id]}`, { raw: true, body: { fields: { parent: { key: map[s.parent] } } } });
  const jql = `key in (${Object.values(map).join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 100);
    if (new Set(found.map((i: any) => i.key)).size < specs.length) return false;
    for (const s of specs) {
      const want = (s.preds || []).length + specs.filter((o) => (o.preds || []).includes(s.id)).length;
      const issue: any = await get(`/rest/api/3/issue/${map[s.id]}?fields=issuelinks,parent`);
      const links = (issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length;
      if (links < want) return false;
      if (s.parent && !issue.fields.parent) return false;
    }
    return true;
  }, { timeout: 45_000, interval: 2_000, label: `${tag} graph propagation` });
  const cf = await getTestState("lz-ppm", { what: "createFixture", name: `[harness-test] ${tag}`, jql });
  return { map, created, planId: cf.planId as string, jql };
}

const trio = (issues: any[], map: Record<string, string>) => {
  const inv = Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
  const out: Record<string, any> = {};
  for (const i of issues) out[inv[i.key] || i.key] = { startDate: i.startDate ?? null, dueDate: i.dueDate ?? null, duration: i.duration ?? null };
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
};

test("A — two inherited edges close a loop the declared graph does not have", async () => {
  const tag = `INH-${Date.now().toString(36)}`;
  const specs: Spec[] = [
    { id: "P1", epic: true, start: "2026-03-02", due: "2026-03-31", preds: ["X"] },
    { id: "P2", epic: true, start: "2026-03-02", due: "2026-03-31", preds: ["Y"] },
    { id: "C1", epic: false, parent: "P1", start: "2026-03-09", due: "2026-03-13" },
    { id: "Y", epic: false, parent: "P1", start: "2026-03-16", due: "2026-03-20" },
    { id: "X", epic: false, parent: "P2", start: "2026-03-02", due: "2026-03-06" },
  ];
  let s: any;
  try {
    s = await seed(tag, specs);
    console.log("A PLAN =", s.planId, JSON.stringify(s.map));
    fs.writeFileSync(STATE, JSON.stringify({ A: { ...s, tag } }, null, 1));
    const t0 = Date.now();
    const r1 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    console.log("A SETTLE#1 ms =", Date.now() - t0);
    console.log("A cycleEdges#1 =", JSON.stringify(r1.meta?.cycleEdges));
    const g1 = trio(r1.issues, s.map);
    console.log("A TRIO#1 =", JSON.stringify(g1, null, 1));
    const r2 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    const g2 = trio(r2.issues, s.map);
    console.log("A cycleEdges#2 =", JSON.stringify(r2.meta?.cycleEdges));
    console.log("A TRIO#2 =", JSON.stringify(g2, null, 1));
    console.log("A IDEMPOTENT =", JSON.stringify(g1) === JSON.stringify(g2));
    const r3 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    console.log("A IDEMPOTENT(3rd) =", JSON.stringify(trio(r3.issues, s.map)) === JSON.stringify(g2));
    expect(JSON.stringify(g2)).toBe(JSON.stringify(g1));
    expect((r1.meta?.cycleEdges || []).length).toBeGreaterThan(0);
  } finally {
    if (s && !KEEP) {
      await getTestState("lz-ppm", { what: "deleteFixture", planId: s.planId }).catch(() => {});
      for (const k of s.created) await deleteIssue(k).catch(() => {});
    }
  }
});

test("B — four chained Epics: ONE settle is already the joint fixed point", async () => {
  const tag = `CHN-${Date.now().toString(36)}`;
  const specs: Spec[] = [];
  const cd = [["2026-04-06", "2026-04-10"], ["2026-04-13", "2026-04-17"], ["2026-04-20", "2026-04-24"], ["2026-04-27", "2026-05-01"],
               ["2026-05-04", "2026-05-08"], ["2026-05-11", "2026-05-15"], ["2026-05-18", "2026-05-22"], ["2026-05-25", "2026-05-29"]];
  for (let e = 0; e < 4; e++) {
    specs.push({ id: `E${e}`, epic: true, start: "2026-04-06", due: "2026-06-30", preds: e ? [`E${e - 1}`] : [] });
    for (let c = 0; c < 2; c++) specs.push({ id: `E${e}C${c}`, epic: false, parent: `E${e}`, start: cd[e * 2 + c][0], due: cd[e * 2 + c][1] });
  }
  let s: any;
  try {
    s = await seed(tag, specs);
    console.log("B PLAN =", s.planId, JSON.stringify(s.map));
    const prev = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
    fs.writeFileSync(STATE, JSON.stringify({ ...prev, B: { ...s, tag } }, null, 1));
    const r1 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    const g1 = trio(r1.issues, s.map);
    console.log("B cycleEdges#1 =", JSON.stringify(r1.meta?.cycleEdges));
    console.log("B TRIO#1 =", JSON.stringify(g1, null, 1));
    const r2 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    const g2 = trio(r2.issues, s.map);
    console.log("B TRIO#2 =", JSON.stringify(g2, null, 1));
    const diffs = Object.keys(g1).filter((k) => JSON.stringify(g1[k]) !== JSON.stringify(g2[k]));
    console.log("B DIFFS settle1 vs settle2 =", JSON.stringify(diffs.map((k) => ({ k, a: g1[k], b: g2[k] })), null, 1));
    console.log("B FIXPOINT =", diffs.length === 0);
    expect(diffs).toEqual([]);
    expect(r1.meta?.cycleEdges || []).toEqual([]);
  } finally {
    if (s && !KEEP) {
      await getTestState("lz-ppm", { what: "deleteFixture", planId: s.planId }).catch(() => {});
      for (const k of s.created) await deleteIssue(k).catch(() => {});
    }
  }
});
