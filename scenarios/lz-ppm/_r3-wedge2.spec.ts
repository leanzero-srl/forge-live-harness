// ROUND-3 item 5, second attempt: wedge a REST-owned plan that really holds 46
// indexed issues (the first attempt raced the index and captured an empty plan).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const plan = JSON.parse(fs.readFileSync(`${OUT}/P1-project+summary.json`, "utf8"));
const BASE = process.env.JIRA_BASE_URL!;
const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
test.describe.configure({ timeout: 1_800_000, mode: "serial" });
let admin: any;
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

test("W2 abandon three captures mid-flight and read the refusal", async () => {
  const p = await api("GET", { resource: "plans", id: plan.id });
  console.log("PLAN", plan.id, "issues", p.json?.plan?.issueCount, "status", p.json?.plan?.status);
  const stale: string[] = [];
  for (let n = 0; n < 3; n++) {
    let r = await api("POST", { resource: "reports", planId: plan.id }, { name: `R3 wedge3 ${n} ${Date.now().toString(36)}` });
    if (![201, 202].includes(r.status)) { console.log(`BEGIN ${n} refused`, r.status, JSON.stringify(r.json).slice(0, 400)); break; }
    const jobId = r.json.job.id;
    // run until artifacts exist but the job is NOT done
    let hops = 0;
    while (!r.json.done && hops < 6) {
      r = await api("POST", { resource: "reports", planId: plan.id, action: "run", jobId }); hops++;
      const st = await api("GET", { resource: "reports", planId: plan.id, action: "capture" });
      const arts = Object.keys(st.json?.job?.artifacts || {}).length;
      if (arts > 5) { console.log(`job ${n} hop ${hops}: ${arts} artifacts, stopping`); break; }
      if (r.json?.error) break;
    }
    const st = await api("GET", { resource: "reports", planId: plan.id, action: "capture" });
    console.log(`job ${n} hops=${hops} state=${st.json?.job?.state} stage=${st.json?.job?.stage} artifacts=${Object.keys(st.json?.job?.artifacts||{}).length} done=${r.json.done}`);
    const cc = await api("POST", { resource: "reports", planId: plan.id, action: "cancel", jobId });
    console.log(`ABANDON ${n} cleanupDone=${cc.json?.job?.cleanupDone} artifactsLeft=${Object.keys(cc.json?.job?.artifacts||{}).length} public=${(cc.json?.job?.publicKeys||[]).length}`);
    if (cc.json?.job?.cleanupDone === false) stale.push(jobId);
  }
  console.log("STALE:", JSON.stringify(stale));
  fs.writeFileSync(`${OUT}/W2-stale.json`, JSON.stringify(stale, null, 1));
  if (!stale.length) { console.log("WEDGE_REPRODUCED=false"); return; }
  console.log("WEDGE_REPRODUCED=true");
  const refused = await api("POST", { resource: "reports", planId: plan.id }, { name: "R3 refused" });
  console.log("REFUSAL:", refused.status, JSON.stringify(refused.json));
  fs.writeFileSync(`${OUT}/W2-refusal.json`, JSON.stringify({ status: refused.status, body: refused.json }, null, 1));
  for (const id of stale) expect(String(refused.json?.error || "")).toContain(id);
  const drain = await api("POST", { resource: "reports", planId: plan.id, action: "cancelAll" });
  console.log("DRAIN:", drain.status, JSON.stringify(drain.json));
  fs.writeFileSync(`${OUT}/W2-drain.json`, JSON.stringify(drain.json, null, 1));
  const retry = await api("POST", { resource: "reports", planId: plan.id }, { name: `R3 after drain ${Date.now().toString(36)}` });
  console.log("RETRY:", retry.status, JSON.stringify(retry.json).slice(0, 300));
});
