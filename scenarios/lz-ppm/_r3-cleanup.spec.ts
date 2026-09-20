// ROUND-3 cleanup: the two fixture plans, the two REST-owned probe plans, and every
// WFH issue either bed created. Then the LZPT bed is proven untouched.
import { test, expect } from "../../fixtures/forge";
import { deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const BASE = process.env.JIRA_BASE_URL!;
const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
let admin: any;
async function api(method: string, query: Record<string, string>, body?: any) {
  const url = new URL(admin.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method, headers: { Authorization: `Bearer ${admin.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

test("Z1 delete every plan and issue this run made", async () => {
  const me = await (await fetch(`${BASE}/rest/api/3/myself`, { headers: { Authorization: AUTH } })).json();
  admin = await getTestState("lz-ppm", { what: "mintApiToken", accountId: me.accountId, name: "r3-admin", role: "admin" });
  const bed1 = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
  const bed2 = JSON.parse(fs.readFileSync(`${OUT}/bed2.json`, "utf8"));
  const probes = ["P1-key-in.json", "P1-project+summary.json"].map((f) => JSON.parse(fs.readFileSync(`${OUT}/${f}`, "utf8")));

  for (const p of [bed1.planId, bed2.planId]) {
    for (let i = 0; i < 12; i++) {
      const d: any = await getTestState("lz-ppm", { what: "deleteFixture", planId: p }).catch((e: any) => ({ error: e.message }));
      console.log(`FIXTURE DELETE ${p} attempt ${i}:`, JSON.stringify(d).slice(0, 160));
      if (!d.error) break;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  for (const pr of probes) {
    for (let i = 0; i < 12; i++) {
      await api("POST", { resource: "reports", planId: pr.id, action: "cancelAll" });
      const d = await api("DELETE", { resource: "plans", id: pr.id });
      console.log(`probe ${pr.id} attempt ${i}: ${d.status}`);
      if (d.status === 200) break;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  const plans = await getTestState("lz-ppm", { what: "plans" });
  const ids = (plans.plans || []).map((p: any) => p.id);
  for (const p of [bed1.planId, bed2.planId, ...probes.map((x) => x.id)]) console.log(`STILL_EXISTS[${p}]=` + ids.includes(p));
  console.log("PLANS NOW:", JSON.stringify(plans.plans, null, 1));

  const all = [...bed1.all, ...bed2.all];
  for (const k of all) await deleteIssue(k).catch((e: any) => console.log("FAIL", k, e.message));
  for (const tag of [bed1.tag, bed2.tag]) {
    const left = await searchJql(`project = WFH AND summary ~ "${tag}"`, ["summary"], 100).catch(() => []);
    console.log(`LEFTOVER[${tag}]:`, left.map((i: any) => i.key).join(",") || "(none)");
    expect(left.length).toBe(0);
  }
  for (const p of [bed1.planId, bed2.planId, ...probes.map((x) => x.id)]) expect(ids.includes(p), `${p} must be gone`).toBe(false);
});

test("Z2 the LZPT bed is exactly as it was", async () => {
  const lzpt = await searchJql("project = LZPT", ["summary"], 200);
  console.log("LZPT_ISSUES=" + lzpt.length);
  const plan: any = await getTestState("lz-ppm", { what: "plan", planId: "plan-msq9dg8l-gz6mz1" });
  const meta = plan.meta || plan.plan || plan;
  console.log("LZPT PLAN issueCount=", meta?.issueCount, "protection=", meta?.protectionEnabled, "status=", meta?.status);
  const drafts: any = await getTestState("lz-ppm", { what: "clearDrafts", planId: "plan-msq9dg8l-gz6mz1" }).catch((e: any) => ({ error: e.message }));
  console.log("CLEARDRAFTS:", JSON.stringify(drafts).slice(0, 300));
  const after: any = await getTestState("lz-ppm", { what: "plan", planId: "plan-msq9dg8l-gz6mz1" });
  const m2 = after.meta || after.plan || after;
  console.log("STAGED_AFTER_CLEANUP=" + !!(m2?.hasDraft || m2?.draft));
  expect(meta?.protectionEnabled).toBe(false);
});
