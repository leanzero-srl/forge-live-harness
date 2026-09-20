// ROUND-3 lane F: the STORYLINE DOCUMENT over REST on the twin — item 1 (report
// storylines[].line + risks) and item 2 (per-beat lines over the beat's own tickets).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const twin = JSON.parse(fs.readFileSync(`${OUT}/P1-key-in.json`, "utf8"));
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

test("F1 storyline report document", async () => {
  let r = await api("POST", { resource: "reports", planId: twin.id }, { name: `R3 SL doc ${Date.now().toString(36)}`, template: "storyline" });
  expect([201, 202], JSON.stringify(r.json).slice(0, 400)).toContain(r.status);
  let hops = 0;
  while (!r.json.done && hops < 40) { r = await api("POST", { resource: "reports", planId: twin.id, action: "run", jobId: r.json.job.id }); hops++; if (r.json?.error) break; }
  expect(r.json.done, JSON.stringify(r.json).slice(0, 600)).toBe(true);
  const reportId = r.json.report.id;
  const sum = await api("GET", { resource: "reports", planId: twin.id, id: reportId });
  fs.writeFileSync(`${OUT}/F1-summary.json`, JSON.stringify(sum.json, null, 1));
  const doc = sum.json?.report?.storyline || r.json.report?.storyline;
  console.log("TEMPLATE:", sum.json?.report?.template, "DOC?", !!doc);
  fs.writeFileSync(`${OUT}/F1-doc.json`, JSON.stringify(doc || sum.json, null, 1));
  expect(doc, "the captured report must carry a storyline document").toBeTruthy();
  console.log("DOC KEYS:", Object.keys(doc).join(","));
  console.log("VERDICT:", JSON.stringify(doc.verdict));
  console.log("FINISH:", JSON.stringify(doc.finish));
  for (const s of doc.storylines || []) console.log(`SL "${s.name}" n=${s.n} rung=${s.rung} holdUp=${s.holdUpKey} finishN=${s.finishN}\n   line: ${s.line}`);
  for (const b of doc.beats || []) console.log(`BEAT "${b.name}" storyline="${b.storyline}" n=${b.n} rung=${b.rung} room=${b.roomDays} holdUp=${b.holdUpKey}\n   line: ${b.line}`);
  console.log("RISKS:", JSON.stringify(doc.risks, null, 1));
  console.log("BEATS OMITTED:", doc.beatsOmitted);
  console.log("NOTES:", JSON.stringify(doc.notes));
  // item 2 — each beat's line is measured over ITS OWN tickets
  for (const b of doc.beats || []) {
    const claims = [...String(b.line || "").matchAll(/(\d+)\s*(?:of\s*(\d+)\s*)?tickets?/g)].map((m) => [Number(m[1]), m[2] ? Number(m[2]) : null]);
    for (const [c, of] of claims) {
      expect(c, `beat "${b.name}" n=${b.n} claims ${c}`).toBeLessThanOrEqual(b.n);
      if (of !== null) expect(of, `beat "${b.name}" n=${b.n} scope ${of}`).toBe(b.n);
    }
  }
  // item 1 — a uniform hold-up names nobody, a strictly tighter one is named
  const named = (doc.beats || []).filter((b: any) => /is holding it up/.test(b.line || ""));
  const anon = (doc.beats || []).filter((b: any) => /no single ticket is tighter than the rest/.test(b.line || ""));
  console.log("BEATS NAMING A KEY:", named.map((b: any) => `${b.name}=>${b.holdUpKey}`).join(" | "));
  console.log("BEATS NAMING NOBODY:", anon.map((b: any) => b.name).join(" | "));
  const slAnon = (doc.storylines || []).filter((s: any) => /no single ticket is tighter than the rest/.test(s.line || ""));
  console.log("STORYLINES NAMING NOBODY:", slAnon.map((s: any) => s.name).join(" | "));
  const del = await api("DELETE", { resource: "reports", planId: twin.id, id: reportId });
  console.log("REPORT DELETED:", del.status);
});
