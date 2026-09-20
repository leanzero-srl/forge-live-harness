// Why did REST createPlan index 0 issues? Probe both JQL shapes, keep the one that
// works as a REST-OWNED twin of bed 2 (the hook's fixture plans are createdBy
// 'harness', so a REST token is role 'none' and every report call is 403).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed2.json`, "utf8"));
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

test("P1 REST createPlan index probe", async () => {
  const shapes = [
    { label: "key-in", jql: bed.jql },
    { label: "project+summary", jql: `project = WFH AND summary ~ "${bed.tag}"` },
  ];
  const made: string[] = [];
  for (const sh of shapes) {
    const name = `[harness-test] R3 probe ${sh.label} ${Date.now().toString(36)}`;
    const c = await api("POST", { resource: "plans" }, { name, jql: sh.jql, protectionEnabled: false, defaultAccess: "none", wait: 120 });
    console.log(`${sh.label}: create ${c.status} issueCount=${c.json?.plan?.issueCount} status=${c.json?.plan?.status} msg=${c.json?.plan?.statusMessage}`);
    if (c.status !== 201) { console.log(JSON.stringify(c.json).slice(0, 400)); continue; }
    const id = c.json.plan.id; made.push(id);
    for (let i = 0; i < 24; i++) {
      const p = await api("GET", { resource: "plans", id });
      if (p.json?.plan?.issueCount > 0) { console.log(`${sh.label}: indexed ${p.json.plan.issueCount} status=${p.json.plan.status}`); break; }
      if (i === 23) console.log(`${sh.label}: STILL 0 status=${p.json?.plan?.status} msg=${p.json?.plan?.statusMessage}`);
      await new Promise(r => setTimeout(r, 5000));
    }
    const re = await api("POST", { resource: "plans", id, action: "reindex" });
    console.log(`${sh.label}: reindex ${re.status} ${JSON.stringify(re.json).slice(0, 200)}`);
    for (let i = 0; i < 24; i++) {
      const p = await api("GET", { resource: "plans", id });
      if (p.json?.plan?.issueCount > 0) { console.log(`${sh.label}: AFTER REINDEX ${p.json.plan.issueCount}`); break; }
      await new Promise(r => setTimeout(r, 5000));
    }
    fs.writeFileSync(`${OUT}/P1-${sh.label}.json`, JSON.stringify({ id, name, jql: sh.jql }, null, 1));
  }
  fs.writeFileSync(`${OUT}/P1-made.json`, JSON.stringify(made, null, 1));
  expect(made.length).toBeGreaterThan(0);
});
