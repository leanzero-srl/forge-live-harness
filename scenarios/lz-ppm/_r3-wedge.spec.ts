// ROUND-3 item 5 retry: wedge a plan that actually HAS issues (the 0-issue plan had
// no artifacts, so one cancel drained it), read the named refusal, then drain.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
const BASE = process.env.JIRA_BASE_URL!;
const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
test.describe.configure({ timeout: 1_800_000, mode: "serial" });
let admin: any, planId: string | null = null;
async function api(method: string, query: Record<string, string>, body?: any) {
  const url = new URL(admin.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method, headers: { Authorization: `Bearer ${admin.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
test.beforeAll(async () => {
  const me = await (await fetch(`${BASE}/rest/api/3/myself`, { headers: { Authorization: AUTH } })).json();
  admin = await getTestState("lz-ppm", { what: "mintApiToken", accountId: me.accountId, name: "r3-admin", role: "admin" });
});

test("W0 clean up the plan the first attempt could not delete", async () => {
  const left = JSON.parse(fs.readFileSync(`${OUT}/wedge-plan.json`, "utf8"));
  for (let i = 0; i < 8; i++) {
    const drain = await api("POST", { resource: "reports", planId: left.planId, action: "cancelAll" });
    const d = await api("DELETE", { resource: "plans", id: left.planId });
    console.log(`retry ${i} drain=${JSON.stringify(drain.json)} delete=${d.status} ${JSON.stringify(d.json).slice(0,160)}`);
    if (d.status === 200) break;
  }
  const plans = await getTestState("lz-ppm", { what: "plans" });
  console.log("FIRST_PLAN_STILL_EXISTS=" + (plans.plans || []).some((p: any) => p.id === left.planId));
});

test("W1 wedge a populated plan, read the refusal, drain it via cancelAll", async () => {
  const name = `[harness-test] R3 wedge2 ${Date.now().toString(36)}`;
  const c = await api("POST", { resource: "plans" }, { name, jql: bed.jql, protectionEnabled: false, defaultAccess: "none", wait: 90 });
  expect(c.status, JSON.stringify(c.json).slice(0, 400)).toBe(201);
  planId = c.json.plan.id;
  console.log("PLAN", planId, "issueCount", c.json.plan.issueCount, "status", c.json.plan.status);
  for (let i = 0; i < 30; i++) {
    const p = await api("GET", { resource: "plans", id: planId! });
    if (p.json?.plan?.issueCount > 0 && p.json.plan.status === "ready") { console.log("INDEXED", p.json.plan.issueCount); break; }
    await new Promise(r => setTimeout(r, 5000));
  }
  fs.writeFileSync(`${OUT}/wedge2-plan.json`, JSON.stringify({ planId, name }, null, 1));
  const stale: string[] = [];
  for (let n = 0; n < 3; n++) {
    let r = await api("POST", { resource: "reports", planId: planId! }, { name: `R3 wedge2 ${n} ${Date.now().toString(36)}` });
    if (![201, 202].includes(r.status)) { console.log(`BEGIN ${n} refused`, r.status, JSON.stringify(r.json).slice(0,300)); break; }
    const jobId = r.json.job.id;
    let hops = 0;
    while (!r.json.done && hops < 4) { r = await api("POST", { resource: "reports", planId: planId!, action: "run", jobId }); hops++; if (r.json?.error) break; }
    const st = await api("GET", { resource: "reports", planId: planId!, action: "capture" });
    console.log(`job ${n} after ${hops} hops stage=${st.json?.job?.stage} artifacts=${Object.keys(st.json?.job?.artifacts||{}).length} state=${st.json?.job?.state}`);
    const cc = await api("POST", { resource: "reports", planId: planId!, action: "cancel", jobId });
    console.log(`ABANDON ${n} job=${jobId} cleanupDone=${cc.json?.job?.cleanupDone} artifactsLeft=${Object.keys(cc.json?.job?.artifacts||{}).length}`);
    if (cc.json?.job?.cleanupDone === false) stale.push(jobId);
  }
  console.log("STALE:", JSON.stringify(stale));
  fs.writeFileSync(`${OUT}/W1-stale.json`, JSON.stringify(stale, null, 1));
  if (stale.length) {
    const refused = await api("POST", { resource: "reports", planId: planId! }, { name: "R3 refused" });
    console.log("REFUSAL:", refused.status, JSON.stringify(refused.json));
    fs.writeFileSync(`${OUT}/W1-refusal.json`, JSON.stringify({ status: refused.status, body: refused.json }, null, 1));
    const msg = String(refused.json?.error || "");
    for (const id of stale) expect(msg, msg).toContain(id);
    const drain = await api("POST", { resource: "reports", planId: planId!, action: "cancelAll" });
    console.log("DRAIN:", drain.status, JSON.stringify(drain.json));
    fs.writeFileSync(`${OUT}/W1-drain.json`, JSON.stringify(drain.json, null, 1));
    expect(drain.json.done).toBe(true);
    expect(drain.json.drained.sort()).toEqual(stale.sort());
    const retry = await api("POST", { resource: "reports", planId: planId! }, { name: `R3 after drain ${Date.now().toString(36)}` });
    console.log("RETRY AFTER DRAIN:", retry.status, JSON.stringify(retry.json).slice(0, 300));
    expect([201, 202]).toContain(retry.status);
    let rr = retry, hops = 0;
    while (!rr.json.done && hops < 40) { rr = await api("POST", { resource: "reports", planId: planId!, action: "run", jobId: retry.json.job.id }); hops++; if (rr.json?.error) break; }
    console.log("RETRY CAPTURE done=", rr.json.done, "report", rr.json.report?.id);
    fs.writeFileSync(`${OUT}/W1-retry.json`, JSON.stringify({ done: rr.json.done, reportId: rr.json.report?.id, error: rr.json.error }, null, 1));
  } else {
    console.log("WEDGE STILL NOT REPRODUCIBLE");
  }
});

test.afterAll(async () => {
  if (!planId) return;
  for (let i = 0; i < 10; i++) {
    await api("POST", { resource: "reports", planId, action: "cancelAll" });
    const d = await api("DELETE", { resource: "plans", id: planId });
    console.log(`cleanup ${i} delete=${d.status} ${JSON.stringify(d.json).slice(0,140)}`);
    if (d.status === 200) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  const plans = await getTestState("lz-ppm", { what: "plans" });
  console.log("STILL_EXISTS=" + (plans.plans || []).some((p: any) => p.id === planId));
});
