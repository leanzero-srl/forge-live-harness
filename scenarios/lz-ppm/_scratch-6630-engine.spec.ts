// TESTER (6.63.0 item 5): re-run the 6.62.0 engine shapes A + B on the 6.63.0 build,
// and drive the BACKEND TARGETED EDIT PATH (applyEdit a child's full trio, then
// recalculateFromIssue over REST) to prove the child's ANCESTORS roll up.
// Writes ONLY [harness-test]-tagged WFH issues; deletes everything in finally.
import { test, expect } from "@playwright/test";
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { request, get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const KEEP = process.env.KEEP === "1";
test.describe.configure({ retries: 0, timeout: 1_200_000, mode: "serial" });

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
  }, { timeout: 60_000, interval: 2_000, label: `${tag} graph propagation` });
  const cf = await getTestState("lz-ppm", { what: "createFixture", name: `[harness-test] ${tag}`, jql });
  return { map, created, planId: cf.planId as string, jql };
}

const trio = (issues: any[], map: Record<string, string>) => {
  const inv = Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
  const out: Record<string, any> = {};
  for (const i of issues) out[inv[i.key] || i.key] = { startDate: i.startDate ?? null, dueDate: i.dueDate ?? null, duration: i.duration ?? null };
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
};

test("A — two inherited edges close a loop the declared graph does not have (6.63.0 re-run)", async () => {
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
    const t0 = Date.now();
    const r1 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    console.log("A SETTLE#1 ms =", Date.now() - t0);
    const inv = Object.fromEntries(Object.entries(s.map).map(([a, b]: any) => [b, a]));
    console.log("A cycleEdges#1 =", JSON.stringify((r1.meta?.cycleEdges || []).map((e: any) => `${inv[e.from] || e.from}>${inv[e.to] || e.to}`)), "raw:", JSON.stringify(r1.meta?.cycleEdges));
    const g1 = trio(r1.issues, s.map);
    console.log("A TRIO#1 =", JSON.stringify(g1));
    const r2 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    const g2 = trio(r2.issues, s.map);
    console.log("A TRIO#2 =", JSON.stringify(g2));
    const r3 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    const g3 = trio(r3.issues, s.map);
    console.log("A IDEMPOTENT 1==2 =", JSON.stringify(g1) === JSON.stringify(g2), " 2==3 =", JSON.stringify(g2) === JSON.stringify(g3));
    expect(JSON.stringify(g2)).toBe(JSON.stringify(g1));
    expect(JSON.stringify(g3)).toBe(JSON.stringify(g2));
    expect((r1.meta?.cycleEdges || []).length).toBeGreaterThan(0);
  } finally {
    if (s && !KEEP) {
      await getTestState("lz-ppm", { what: "deleteFixture", planId: s.planId }).catch(() => {});
      for (const k of s.created) await deleteIssue(k).catch(() => {});
      const plans: any = await getTestState("lz-ppm", { what: "plans" });
      console.log("A STILL_EXISTS =", (plans.plans || []).some((p: any) => p.id === s.planId));
    }
  }
});

test("B — four chained Epics: ONE settle is already the joint fixed point (6.63.0 re-run)", async () => {
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
    const r1 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    const g1 = trio(r1.issues, s.map);
    console.log("B cycleEdges#1 =", JSON.stringify(r1.meta?.cycleEdges));
    console.log("B TRIO#1 =", JSON.stringify(g1));
    const r2 = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    const g2 = trio(r2.issues, s.map);
    const diffs = Object.keys(g1).filter((k) => JSON.stringify(g1[k]) !== JSON.stringify(g2[k]));
    console.log("B DIFFS settle1 vs settle2 =", JSON.stringify(diffs.map((k) => ({ k, a: g1[k], b: g2[k] }))));
    console.log("B FIXPOINT =", diffs.length === 0);
    expect(diffs).toEqual([]);
    expect(r1.meta?.cycleEdges || []).toEqual([]);
  } finally {
    if (s && !KEEP) {
      await getTestState("lz-ppm", { what: "deleteFixture", planId: s.planId }).catch(() => {});
      for (const k of s.created) await deleteIssue(k).catch(() => {});
      const plans: any = await getTestState("lz-ppm", { what: "plans" });
      console.log("B STILL_EXISTS =", (plans.plans || []).some((p: any) => p.id === s.planId));
    }
  }
});

test("C — the BACKEND targeted edit path rolls the edited child's ancestors up", async () => {
  // GP (Epic) > P (Work package, parent GP) > L (Work package, parent P) — two
  // ancestor levels, so "all of them, deepest first" is testable, not just one.
  const tag = `ANC-${Date.now().toString(36)}`;
  let s: any = null; let token: any = null; let planId: string | null = null;
  let created: string[] = [];
  const map: Record<string, string> = {};
  const BASE = process.env.JIRA_BASE_URL!;
  const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  const me = await (await fetch(`${BASE}/rest/api/3/myself`, { headers: { Authorization: AUTH } })).json();
  try {
    // Jira forbids a Work package under a Work package, so the third level is a
    // real SUBTASK (type "Payment" on WFH) created with its parent inline.
    const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
    map.GP = (await createIssue({ projectKey: PROJECT, issueType: "Epic", summary: `[harness-test] ${tag} GP` })).key;
    map.P = (await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `[harness-test] ${tag} P` })).key;
    created = [map.GP, map.P];
    await request("PUT", `/rest/api/3/issue/${map.P}`, { raw: true, body: { fields: { parent: { key: map.GP } } } });
    for (const id of ["L1", "L2"]) {
      const j = await createIssue({ projectKey: PROJECT, issueType: "Payment", summary: `[harness-test] ${tag} ${id}`, fields: { parent: { key: map.P } } });
      map[id] = j.key; created.push(j.key);
    }
    await setDates(map.GP, { start: "2026-06-01", due: "2026-06-05" }, fc);
    await setDates(map.P, { start: "2026-06-01", due: "2026-06-05" }, fc);
    await setDates(map.L1, { start: "2026-06-01", due: "2026-06-05" }, fc);
    await setDates(map.L2, { start: "2026-06-01", due: "2026-06-03" }, fc);
    const jql = `key in (${Object.values(map).join(",")})`;
    await waitForTerminal(async () => {
      const found = await searchJql(jql, ["summary"], 100);
      if (new Set(found.map((i: any) => i.key)).size < 4) return false;
      for (const k of [map.P, map.L1, map.L2]) {
        const issue: any = await get(`/rest/api/3/issue/${k}?fields=parent`);
        if (!issue.fields.parent) return false;
      }
      return true;
    }, { timeout: 60_000, interval: 2_000, label: `${tag} hierarchy propagation` });
    s = { map, created, jql };
    console.log("C SEED =", JSON.stringify(map));
    // The hook fixture has no owner, so requireEdit fails for a REST token. Make a
    // REST-owned plan over the same JQL instead and drive THAT.
    token = await getTestState("lz-ppm", { what: "mintApiToken", accountId: me.accountId, name: "tester-6630-anc", role: "admin" });
    const api = async (method: string, query: Record<string, string>, body?: any) => {
      const url = new URL(token.url);
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
      const res = await fetch(url.toString(), { method, headers: { Authorization: `Bearer ${token.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const t = await res.text(); let j: any = null; try { j = JSON.parse(t); } catch {}
      return { status: res.status, json: j, text: t };
    };
    const c = await api("POST", { resource: "plans" }, { name: `[harness-test] ${tag} rest`, jql, protectionEnabled: false, defaultAccess: "none", wait: 20 });
    console.log("C PLAN CREATE =", c.status, JSON.stringify(c.json?.plan?.id));
    expect(c.status).toBe(201);
    planId = c.json.plan.id;
    for (let i = 0; i < 40; i++) {
      const p = await api("POST", { resource: "plans", id: planId!, action: "progress" });
      if (["indexed", "error"].includes(p.json?.status)) { console.log("C INDEX =", p.json.status, p.json.issueCount); break; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    const before = await getTestState("lz-ppm", { what: "plan", planId });
    console.log("C BEFORE =", JSON.stringify(trio(before.issues, s.map)));

    // The user's edit lands in KVS first (exactly what the resolver does), then the
    // targeted engine runs. A FULL trio on the child.
    for (const [field, value] of [["startDate", "2026-06-15"], ["dueDate", "2026-06-19"], ["duration", "5"]] as any[]) {
      const r = await getTestState("lz-ppm", { what: "applyEdit", planId, key: s.map.L1, field, value });
      console.log(`C applyEdit ${field}=${value} ->`, JSON.stringify(r).slice(0, 120));
    }
    const mid = await getTestState("lz-ppm", { what: "plan", planId });
    console.log("C AFTER EDIT, BEFORE RECALC =", JSON.stringify(trio(mid.issues, s.map)));

    const rc = await api("POST", { resource: "call", name: "recalculateFromIssue" }, { planId, issueKey: s.map.L1, changedFields: ["startDate", "dueDate", "duration"] });
    console.log("C recalculateFromIssue =", rc.status, JSON.stringify(rc.json).slice(0, 900));
    expect(rc.status).toBe(200);

    const after = await getTestState("lz-ppm", { what: "plan", planId });
    const g = trio(after.issues, s.map);
    console.log("C AFTER RECALC =", JSON.stringify(g));
    // INDEPENDENT expectation: a parent spans its children.
    const expP = { start: [g.L1.startDate, g.L2.startDate].sort()[0], due: [g.L1.dueDate, g.L2.dueDate].sort().slice(-1)[0] };
    console.log("C EXPECT P =", JSON.stringify(expP), "GOT P =", JSON.stringify({ start: g.P.startDate, due: g.P.dueDate }));
    console.log("C EXPECT GP =", JSON.stringify({ start: g.P.startDate, due: g.P.dueDate }), "GOT GP =", JSON.stringify({ start: g.GP.startDate, due: g.GP.dueDate }));
    expect(g.P.startDate).toBe(expP.start);
    expect(g.P.dueDate).toBe(expP.due);
    expect(g.GP.startDate).toBe(expP.start);
    expect(g.GP.dueDate).toBe(expP.due);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    if (token?.row?.id) await getTestState("lz-ppm", { what: "revokeApiToken", id: token.row.id }).catch(() => {});
    if (!KEEP) for (const k of created.slice().reverse()) await deleteIssue(k).catch(() => {});
    const plans: any = await getTestState("lz-ppm", { what: "plans" });
    console.log("C LEFTOVER =", JSON.stringify((plans.plans || []).filter((p: any) => /harness-test/.test(p.name)).map((p: any) => p.name)));
  }
});
