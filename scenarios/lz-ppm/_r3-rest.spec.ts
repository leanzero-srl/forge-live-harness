// ROUND-3 (dev 6.73.0) REST lane, item 5: the cancelAll route.
// Builds its OWN plan (the hook's createFixture sets createdBy:'harness', so a REST
// token is role 'none' on it and every report call is 403). Deletes it in the end.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
const BASE = process.env.JIRA_BASE_URL!;
const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
test.describe.configure({ timeout: 1_200_000, mode: "serial" });

let admin: any, accountId: string, planId: string | null = null;
async function api(method: string, query: Record<string, string>, body?: any) {
  const url = new URL(admin.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${admin.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

test.beforeAll(async () => {
  const me = await (await fetch(`${BASE}/rest/api/3/myself`, { headers: { Authorization: AUTH } })).json();
  accountId = me.accountId;
  admin = await getTestState("lz-ppm", { what: "mintApiToken", accountId, name: "r3-admin", role: "admin" });
  const name = `[harness-test] R3 wedge ${Date.now().toString(36)}`;
  const c = await api("POST", { resource: "plans" }, { name, jql: bed.jql, protectionEnabled: false, defaultAccess: "none", wait: 40 });
  expect(c.status, JSON.stringify(c.json).slice(0, 500)).toBe(201);
  planId = c.json.plan.id;
  fs.writeFileSync(`${OUT}/wedge-plan.json`, JSON.stringify({ planId, name }, null, 1));
  console.log("WEDGE PLAN", planId, name, "issues", c.json.plan.issueCount);
});

test("X1 cancelAll with nothing to drain: drained 0, done true, no write", async () => {
  const r = await api("POST", { resource: "reports", planId: planId!, action: "cancelAll" });
  console.log("CANCELALL EMPTY:", r.status, JSON.stringify(r.json));
  fs.writeFileSync(`${OUT}/X1-cancelall.json`, JSON.stringify({ status: r.status, body: r.json }, null, 1));
  expect(r.status).toBe(200);
  expect(r.json.drained).toEqual([]);
  expect(r.json.remaining).toEqual([]);
  expect(r.json.done).toBe(true);
  expect(r.json.passes).toBe(0);
  const upper = await api("POST", { resource: "reports", planId: planId!, action: "CANCELALL" });
  console.log("CANCELALL alias:", upper.status, JSON.stringify(upper.json));
  expect(upper.status).toBe(200);
  expect(upper.json.done).toBe(true);
  const bad = await api("POST", { resource: "reports", planId: planId!, action: "nonsense" });
  console.log("UNKNOWN ACTION:", bad.status, JSON.stringify(bad.json));
  expect(bad.status).toBe(400);
  expect(bad.json.actions).toContain("cancelAll");
});

test("X2 wedge the plan with three abandoned captures, read the refusal, drain it", async () => {
  const stale: string[] = [];
  for (let n = 0; n < 3; n++) {
    let r = await api("POST", { resource: "reports", planId: planId! }, { name: `R3 wedge ${n} ${Date.now().toString(36)}` });
    if (r.status !== 201 && r.status !== 202) { console.log(`BEGIN ${n} refused:`, r.status, JSON.stringify(r.json)); break; }
    const jobId = r.json.job.id;
    for (let hop = 0; hop < 3 && !r.json.done; hop++) {
      r = await api("POST", { resource: "reports", planId: planId!, action: "run", jobId });
      if (r.json?.error) { console.log(`run ${n} hop ${hop} error`, JSON.stringify(r.json).slice(0, 300)); break; }
    }
    const c = await api("POST", { resource: "reports", planId: planId!, action: "cancel", jobId });
    console.log(`ABANDON ${n} job=${jobId} cancel=${c.status} cleanupDone=${c.json?.job?.cleanupDone} artifacts=${Object.keys(c.json?.job?.artifacts || {}).length}`);
    if (c.json?.job?.cleanupDone === false) stale.push(jobId);
  }
  console.log("STALE JOBS:", JSON.stringify(stale));
  fs.writeFileSync(`${OUT}/X2-stale.json`, JSON.stringify(stale, null, 1));
  if (!stale.length) { console.log("WEDGE NOT REPRODUCIBLE — a single cancel drained every job"); return; }
  // the refusal NAMES them
  const refused = await api("POST", { resource: "reports", planId: planId! }, { name: "R3 refused" });
  console.log("REFUSAL:", refused.status, JSON.stringify(refused.json));
  fs.writeFileSync(`${OUT}/X2-refusal.json`, JSON.stringify({ status: refused.status, body: refused.json }, null, 1));
  const msg = String(refused.json?.error || "");
  for (const id of stale) expect(msg, msg).toContain(id);
  expect(msg).toContain("cancelAllReportCaptures");
  // and `run` on a wedged plan is NOT 503 any more
  const runWedged = await api("POST", { resource: "reports", planId: planId!, action: "run", jobId: stale[0] });
  console.log("RUN ON WEDGED:", runWedged.status, JSON.stringify(runWedged.json).slice(0, 300));
});

test.afterAll(async () => {
  if (!planId) return;
  const drain = await api("POST", { resource: "reports", planId, action: "cancelAll" });
  console.log("FINAL DRAIN:", drain.status, JSON.stringify(drain.json));
  const d = await api("DELETE", { resource: "plans", id: planId });
  console.log("PLAN DELETE:", d.status, JSON.stringify(d.json).slice(0, 200));
  const plans = await getTestState("lz-ppm", { what: "plans" });
  const stillExists = (plans.plans || []).some((p: any) => p.id === planId);
  console.log("STILL_EXISTS=" + stillExists);
});
