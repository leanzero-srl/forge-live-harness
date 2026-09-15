// lz-ppm DEEP suite — the REST API web trigger, end to end against the deployed app.
// Pure REST + hook + Jira oracle: no browser. Mints tokens through the dev hook
// (`mintApiToken`, what an admin does in Settings → API Access), creates a REAL plan
// on the LZPT bed, indexes it, reads it back, exports it, captures a sponsor report,
// exercises snapshots/baseline/dependencies/floors, and DELETES everything it made.
// Every number is checked against an INDEPENDENT source (Jira's own search), never
// against the app's other endpoint.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

test.describe.configure({ timeout: 300_000, mode: "serial" });

const APP = "lz-ppm";
const BASE = process.env.JIRA_BASE_URL!;
const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
const JQL = "project = LZPT";

type Minted = { token: string; row: { id: string; role: string; accountId: string }; url: string };
let admin: Minted, viewer: Minted, editor: Minted;
let accountId: string;
let planId: string | null = null;
let jiraKeys: string[] = [];
let reportId: string | null = null;
let depPair: [string, string] | null = null;

async function jira(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: AUTH, Accept: "application/json" } });
  if (!res.ok) throw new Error(`jira ${path} -> ${res.status}`);
  return res.json();
}
async function jiraIssues(jql: string): Promise<any[]> {
  const out: any[] = []; let next: string | undefined;
  do {
    const d = await jira(`/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,issuelinks,customfield_10015,duedate${next ? `&nextPageToken=${encodeURIComponent(next)}` : ""}`);
    out.push(...(d.issues || [])); next = d.nextPageToken;
  } while (next);
  return out;
}

async function api(who: Minted | string, method: string, query: Record<string, string>, body?: any) {
  const url = new URL(typeof who === "string" ? admin.url : who.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const token = typeof who === "string" ? who : who.token;
  const res = await fetch(url.toString(), {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* csv etc. */ }
  return { status: res.status, json, text, headers: res.headers };
}

test.beforeAll(async () => {
  const me = await jira("/rest/api/3/myself");
  accountId = me.accountId;
  admin = await getTestState(APP, { what: "mintApiToken", accountId, name: "harness-admin", role: "admin" });
  viewer = await getTestState(APP, { what: "mintApiToken", accountId, name: "harness-viewer", role: "viewer" });
  editor = await getTestState(APP, { what: "mintApiToken", accountId, name: "harness-editor", role: "editor" });
  expect(admin.url, "the webtrigger URL must resolve (webTrigger.getUrl)").toMatch(/^https:\/\//);
  expect(admin.token).toMatch(/^lzm_[0-9a-f]{48}$/);
  jiraKeys = (await jiraIssues(JQL)).map((i) => i.key).sort();
  expect(jiraKeys.length, "LZPT bed must hold the 45 seeded issues").toBe(45);
});

test.afterAll(async () => {
  // RESTORE THE BED: dependency, report, plan, tokens — in that order, best-effort each.
  const log: string[] = [];
  try { if (depPair && planId) log.push(`dep ${JSON.stringify((await api(admin, "DELETE", { resource: "dependencies", planId }, { fromKey: depPair[0], toKey: depPair[1] })).status)}`); } catch (e) { log.push(`dep err ${e}`); }
  try { if (planId && reportId) log.push(`report ${(await api(admin, "DELETE", { resource: "reports", planId, id: reportId })).status}`); } catch (e) { log.push(`report err ${e}`); }
  try { if (planId) { const r = await api(admin, "DELETE", { resource: "plans", id: planId }); log.push(`plan ${r.status}`); if (r.status === 200) planId = null; } } catch (e) { log.push(`plan err ${e}`); }
  if (planId) { try { await getTestState(APP, { what: "deleteFixture", planId }); log.push("plan via hook"); planId = null; } catch (e) { log.push(`hook err ${e}`); } }
  for (const m of [admin, viewer, editor]) { try { if (m?.row?.id) await getTestState(APP, { what: "revokeApiToken", id: m.row.id }); } catch { /* best-effort */ } }
  const plans = await getTestState(APP, { what: "plans" });
  const leftover = (plans.plans || []).filter((p: any) => /REST smoke/.test(p.name));
  console.log(`[rest-api cleanup] ${log.join(" · ")} · leftover REST plans: ${leftover.length}`);
  expect(leftover.length, "no REST smoke plan may survive").toBe(0);
});

test("auth: no token, a malformed token and a wrong token are all 401 with no detail", async () => {
  for (const t of ["", "nope", "lzm_" + "0".repeat(48)]) {
    const r = await api(t, "GET", { resource: "whoami" });
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: "unauthorized" });
  }
});

test("whoami + capabilities reflect the token's role; blocked resolvers stay blocked for admin", async () => {
  const w = await api(admin, "GET", { resource: "whoami" });
  expect(w.status).toBe(200);
  expect(w.json.token.role).toBe("admin");
  expect(w.json.token.accountId).toBe(accountId);
  expect(w.json.token.hash).toBeUndefined();
  const c = await api(viewer, "GET", { resource: "capabilities" });
  expect(c.json.role).toBe("viewer");
  expect(c.json.resolvers.length).toBeGreaterThan(100);
  expect(c.json.resolvers.find((r: any) => r.name === "createPlan").allowed).toBe(false);
  expect(c.json.blocked.map((b: any) => b.name)).toEqual(expect.arrayContaining(["purgeAllData", "saveFieldConfig", "setAiConfig"]));
  const p = await api(admin, "POST", { resource: "call", name: "purgeAllData" }, {});
  expect(p.status).toBe(403);
  expect(p.json.error).toMatch(/not available over the REST API/);
});

test("floors: a viewer token cannot create a plan; an editor token cannot delete one", async () => {
  const v = await api(viewer, "POST", { resource: "plans" }, { name: "REST smoke never", jql: JQL, index: false });
  expect(v.status).toBe(403);
  expect(v.json.needsRole).toBe("editor");
  const e = await api(editor, "DELETE", { resource: "plans", id: "plan-does-not-matter" });
  expect(e.status).toBe(403);
  expect(e.json.needsRole).toBe("admin");
  // Neither reached a resolver: no plan appeared.
  const plans = await getTestState(APP, { what: "plans" });
  expect((plans.plans || []).some((p: any) => p.name === "REST smoke never")).toBe(false);
});

test("create a plan from JQL, index it, and the indexed set equals Jira's answer for the same JQL", async () => {
  const name = `REST smoke ${Date.now().toString(36)}`;
  const c = await api(editor, "POST", { resource: "plans" }, { name, jql: JQL, protectionEnabled: false, defaultAccess: "none", wait: 15 });
  expect(c.status, JSON.stringify(c.json)).toBe(201);
  planId = c.json.plan.id;
  expect(c.json.plan.name).toBe(name);
  expect(c.json.plan.createdBy, "the plan is owned by the minting account").toBe(accountId);
  expect(c.json.plan.protectionEnabled).toBe(false);
  expect(c.json.plan.sources).toEqual([expect.objectContaining({ type: "jql", query: JQL })]);
  expect(c.json.indexing).toBeTruthy();
  // Indexing is queued; the bounded wait may or may not have settled it. Poll.
  let progress = c.json.progress;
  for (let i = 0; i < 60 && (!progress || !["indexed", "error"].includes(progress.status)); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    progress = (await api(viewer, "POST", { resource: "plans", id: planId!, action: "progress" })).json;
    // viewer may not POST an action? progress is a read → floor viewer.
  }
  expect(progress.status, JSON.stringify(progress)).toBe("indexed");
  expect(progress.issueCount).toBe(jiraKeys.length);

  const one = await api(viewer, "GET", { resource: "plans", id: planId! });
  expect(one.status).toBe(200);
  expect(one.json.plan.id).toBe(planId);
  expect(one.json.progress.status).toBe("indexed");
  expect(one.json.progress.issueCount).toBe(45);

  const list = await api(viewer, "GET", { resource: "plans" });
  expect(list.status).toBe(200);
  const mine = list.json.plans.find((p: any) => p.id === planId);
  expect(mine, "the new plan is listed for the token's account").toBeTruthy();
  expect(mine.issueCount).toBe(45);
  expect(mine.role).toBe("owner");

  const issues = await api(viewer, "GET", { resource: "issues", planId: planId! });
  expect(issues.status).toBe(200);
  expect(issues.json.issues.map((i: any) => i.key).sort()).toEqual(jiraKeys);
  const one2 = await api(viewer, "GET", { resource: "issues", planId: planId!, key: jiraKeys[0] });
  expect(one2.json.issue.key).toBe(jiraKeys[0]);
});

test("export: the CSV carries every issue with the dates Jira holds; JSON export agrees", async () => {
  expect(planId).toBeTruthy();
  const csv = await api(viewer, "GET", { resource: "export", planId: planId! });
  expect(csv.status).toBe(200);
  expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
  expect(csv.headers.get("content-disposition")).toMatch(/schedule\.csv/);
  const lines = csv.text.trim().split("\r\n");
  expect(lines[0]).toBe("key,summary,type,status,statusCategory,parentKey,assigneeName,priority,startDate,dueDate,duration,buffer,predecessors,successors,rank");
  expect(lines.length - 1).toBe(45);
  const csvKeys = lines.slice(1).map((l) => l.split(",")[0]).sort();
  expect(csvKeys).toEqual(jiraKeys);
  // Independent oracle: Jira's own start (cf_10015) and due for 5 dated issues must appear on their CSV rows.
  const jiraRows = await jiraIssues(`${JQL} AND duedate is not EMPTY`);
  let checked = 0;
  for (const j of jiraRows.slice(0, 5)) {
    const row = lines.find((l) => l.startsWith(j.key + ","))!;
    expect(row, `row for ${j.key}`).toBeTruthy();
    if (j.fields.customfield_10015) expect(row).toContain(`,${j.fields.customfield_10015},`);
    expect(row).toContain(`,${j.fields.duedate},`);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
  const json = await api(viewer, "GET", { resource: "export", planId: planId!, format: "json" });
  expect(json.json.count).toBe(45);
  expect(Object.keys(json.json.issues[0]).sort()).toEqual([...json.json.columns].sort());
});

test("update: PUT renames the plan and GET reflects it; recalculate runs", async () => {
  const r = await api(editor, "PUT", { resource: "plans", id: planId! }, { name: "REST smoke renamed" });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const g = await api(viewer, "GET", { resource: "plans", id: planId! });
  expect(g.json.plan.name).toBe("REST smoke renamed");
  const rc = await api(editor, "POST", { resource: "plans", id: planId!, action: "recalculate" });
  expect(rc.status, JSON.stringify(rc.json)).toBe(200);
});

test("snapshots and baseline round-trip; a viewer cannot capture", async () => {
  const denied = await api(viewer, "POST", { resource: "snapshots", planId: planId! }, { name: "nope" });
  expect(denied.status).toBe(403);
  const s = await api(editor, "POST", { resource: "snapshots", planId: planId! }, { name: "REST snap" });
  expect(s.status, JSON.stringify(s.json)).toBe(200);
  const snapId = s.json.snapshot?.id;
  expect(snapId).toBeTruthy();
  const l = await api(viewer, "GET", { resource: "snapshots", planId: planId! });
  expect(l.json.entries.map((e: any) => e.id)).toContain(snapId);
  const one = await api(viewer, "GET", { resource: "snapshots", planId: planId!, id: snapId });
  expect(one.status).toBe(200);

  const b0 = await api(viewer, "GET", { resource: "baseline", planId: planId! });
  expect(b0.status).toBe(200);
  const set = await api(editor, "POST", { resource: "baseline", planId: planId! }, { name: "REST baseline" });
  expect(set.status, JSON.stringify(set.json)).toBe(200);
  const b1 = await api(viewer, "GET", { resource: "baseline", planId: planId! });
  expect(b1.json.baseline ?? b1.json.snapshotId ?? b1.json.pointer, "a baseline is now set").toBeTruthy();
  const clr = await api(editor, "DELETE", { resource: "baseline", planId: planId! });
  expect(clr.status).toBe(200);
  const b2 = await api(viewer, "GET", { resource: "baseline", planId: planId! });
  expect(JSON.stringify(b2.json)).toBe(JSON.stringify(b0.json));
});

test("dependencies: create a Blocks link between two unlinked leaves, see it on the issues, remove it, see it gone", async () => {
  const issues = (await api(viewer, "GET", { resource: "issues", planId: planId! })).json.issues as any[];
  const free = issues.filter((i) => !i.parentKey || true).filter((i) => (i.predecessors || []).length === 0 && (i.successors || []).length === 0 && !issues.some((c) => c.parentKey === i.key));
  expect(free.length, "need two unlinked leaves").toBeGreaterThanOrEqual(2);
  const [a, b] = [free[0].key, free[1].key];
  depPair = [a, b];
  const bad = await api(editor, "POST", { resource: "dependencies", planId: planId! }, { fromKey: a });
  expect(bad.status).toBe(400);
  const c = await api(editor, "POST", { resource: "dependencies", planId: planId! }, { fromKey: a, toKey: b });
  expect(c.status, JSON.stringify(c.json)).toBe(200);
  const after = (await api(viewer, "GET", { resource: "issues", planId: planId! })).json.issues as any[];
  expect(after.find((i) => i.key === b).predecessors).toContain(a);
  expect(after.find((i) => i.key === a).successors).toContain(b);
  // Independent oracle: Jira holds the link.
  const j = await jira(`/rest/api/3/issue/${b}?fields=issuelinks`);
  expect(j.fields.issuelinks.some((l: any) => l.inwardIssue?.key === a || l.outwardIssue?.key === a)).toBe(true);
  const d = await api(editor, "DELETE", { resource: "dependencies", planId: planId! }, { fromKey: a, toKey: b });
  expect(d.status, JSON.stringify(d.json)).toBe(200);
  depPair = null;
  const gone = (await api(viewer, "GET", { resource: "issues", planId: planId! })).json.issues as any[];
  expect(gone.find((i) => i.key === b).predecessors).not.toContain(a);
  const j2 = await jira(`/rest/api/3/issue/${b}?fields=issuelinks`);
  expect(j2.fields.issuelinks.some((l: any) => l.inwardIssue?.key === a || l.outwardIssue?.key === a)).toBe(false);
});

test("sponsor report: POST captures and drives to a published report; list/summary/page read it; admin deletes it", async () => {
  const denied = await api(viewer, "POST", { resource: "reports", planId: planId! }, { name: "nope" });
  expect(denied.status).toBe(403);
  let r = await api(editor, "POST", { resource: "reports", planId: planId! }, { name: "REST sponsor report" });
  expect([201, 202], JSON.stringify(r.json)).toContain(r.status);
  let hops = 0;
  while (!r.json.done && hops < 20) {
    expect(r.json.job?.id, JSON.stringify(r.json)).toBeTruthy();
    expect(r.json.error, JSON.stringify(r.json)).toBeUndefined();
    r = await api(editor, "POST", { resource: "reports", planId: planId!, action: "run", jobId: r.json.job.id });
    hops++;
  }
  expect(r.json.done, JSON.stringify(r.json)).toBe(true);
  expect(r.json.job.state).toBe("complete");
  expect(r.json.job.cleanupDone).toBe(true);
  expect(r.json.report?.id).toBeTruthy();
  reportId = r.json.report.id;
  console.log(`[rest-api] report ${reportId} captured in ${hops + 1} call(s)`);

  const list = await api(viewer, "GET", { resource: "reports", planId: planId! });
  expect(list.status).toBe(200);
  const entry = list.json.entries.find((e: any) => e.id === reportId);
  expect(entry).toBeTruthy();
  expect(entry.name).toBe("REST sponsor report");
  expect(entry.issueCount).toBe(45);
  const summary = await api(viewer, "GET", { resource: "reports", planId: planId!, id: reportId! });
  expect(summary.status, JSON.stringify(summary.json)).toBe(200);
  expect(summary.json.report).toBeTruthy();
  const status = await api(editor, "GET", { resource: "reports", planId: planId!, action: "capture" });
  expect(status.status).toBe(200);

  const denyDel = await api(editor, "DELETE", { resource: "reports", planId: planId!, id: reportId! });
  expect(denyDel.status).toBe(403);
  const del = await api(admin, "DELETE", { resource: "reports", planId: planId!, id: reportId! });
  expect(del.status, JSON.stringify(del.json)).toBe(200);
  reportId = null;
  const list2 = await api(viewer, "GET", { resource: "reports", planId: planId! });
  expect(list2.json.entries.some((e: any) => e.id === entry.id)).toBe(false);
});

test("generic call: a resolver payload passes straight through; unknown resolver is 404", async () => {
  const v = await api(viewer, "POST", { resource: "call", name: "getPlanVersion" }, { planId });
  expect(v.status, JSON.stringify(v.json)).toBe(200);
  const u = await api(admin, "POST", { resource: "call", name: "doesNotExist" }, {});
  expect(u.status).toBe(404);
  const wrongPlan = await api(viewer, "POST", { resource: "call", name: "getPlan" }, { planId: "plan-nope" });
  expect(wrongPlan.status).toBe(404);
});

test("delete: admin removes the plan; it is gone from GET and from the registry; revoked tokens are dead", async () => {
  const d = await api(admin, "DELETE", { resource: "plans", id: planId! });
  expect(d.status, JSON.stringify(d.json)).toBe(200);
  const g = await api(admin, "GET", { resource: "plans", id: planId! });
  expect(g.status).toBe(404);
  const plans = await getTestState(APP, { what: "plans" });
  expect((plans.plans || []).some((p: any) => p.id === planId)).toBe(false);
  planId = null;
  const rv = await getTestState(APP, { what: "revokeApiToken", id: viewer.row.id });
  expect(rv.revoked).toBe(true);
  const dead = await api(viewer, "GET", { resource: "whoami" });
  expect(dead.status).toBe(401);
});
