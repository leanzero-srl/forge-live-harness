// LZ7F0 item 1 — the BREAK-bulk-publish-resettle F1 bed, on WFH.
//   X 06-01|06-01 1d No  -> B
//   A 06-01|06-02 5d Yes -> D
//   B 06-01|06-01 10d Yes-> D
//   D 06-03|06-04 2d No   preds [A,B]
// The plan is created over the APP REST API with a token minted for the human
// admin account, so the browser session (mihai) is its OWNER and every
// requireEdit path (draft autosave, Apply review) is reachable. A hook
// createFixture plan is createdBy 'harness' and would refuse.
import { createIssue, setDates, linkBlocks } from "../../data/jira-build.mjs";
import { get, searchJql } from "../../data/jira.mjs";
import fs from "fs";

const PROJECT = "WFH";
const HOOK = process.env.LZ_PPM_TESTHOOK_URL, SEC = process.env.HARNESS_SECRET;
const hook = async (qs) => {
  const r = await fetch(`${HOOK}?${qs}`, { headers: { Authorization: `Bearer ${SEC}` } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return { status: r.status, text: t.slice(0, 400) }; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.env.JIRA_BASE_URL;
const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");

const fc = (await hook("what=fieldConfig")).fields;
console.log("fields", JSON.stringify(fc));
const me = await (await fetch(`${BASE}/rest/api/3/myself`, { headers: { Authorization: AUTH } })).json();
console.log("acting as", me.accountId, me.displayName);

const tag = "LZ7F0";
const mk = async (s) => (await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `[harness-test] ${tag} ${s}` })).key;
const X = await mk("X pusher");
const A = await mk("A wide declared");
const B = await mk("B exhausted");
const D = await mk("D common successor");
console.log("KEYS", JSON.stringify({ X, A, B, D }));

await setDates(X, { start: "2026-06-01", due: "2026-06-01", duration: 1, buffer: "No" }, fc);
await setDates(A, { start: "2026-06-01", due: "2026-06-02", duration: 5, buffer: "Yes" }, fc);
await setDates(B, { start: "2026-06-01", due: "2026-06-01", duration: 10, buffer: "Yes" }, fc);
await setDates(D, { start: "2026-06-03", due: "2026-06-04", duration: 2, buffer: "No" }, fc);
await linkBlocks(X, B); await linkBlocks(A, D); await linkBlocks(B, D);

const all = [X, A, B, D];
const jql = `key in (${all.join(",")})`;
for (let i = 0; i < 60; i++) {
  const found = await searchJql(jql, ["summary"], 50);
  const di = await get(`/rest/api/3/issue/${D}?fields=issuelinks`);
  if (found.length === 4 && (di.fields.issuelinks || []).length >= 2) break;
  await sleep(4000);
}
// verify Jira really stored duration/buffer (a field with no context is a silent 204)
for (const k of all) {
  const f = (await get(`/rest/api/3/issue/${k}?fields=${fc.startDate},duedate,${fc.duration},${fc.buffer}`)).fields;
  console.log("STORED", k, JSON.stringify({ start: f[fc.startDate], due: f.duedate, dur: f[fc.duration], buf: f[fc.buffer]?.value }));
}

const admin = await hook(`what=mintApiToken&accountId=${encodeURIComponent(me.accountId)}&name=lz7f0&role=admin`);
console.log("TOKEN_ID", admin.id, "url", admin.url);
const api = async (method, query, body) => {
  const url = new URL(admin.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method, headers: { Authorization: `Bearer ${admin.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch {}
  return { status: res.status, json: j, text };
};
const planName = `${tag} bulk F1 bed`;
const c = await api("POST", { resource: "plans" }, { name: planName, jql, protectionEnabled: false, defaultAccess: "none", wait: 120 });
console.log("CREATE", c.status, JSON.stringify(c.json?.plan || c.json).slice(0, 400));
const planId = c.json?.plan?.id;
for (let i = 0; i < 30; i++) {
  const p = await api("GET", { resource: "plans", id: planId });
  if (p.json?.plan?.issueCount > 0) { console.log("INDEXED", p.json.plan.issueCount, p.json.plan.status); break; }
  await sleep(5000);
}
const rows = await hook(`what=plan&planId=${planId}`);
console.log("ROWS", JSON.stringify((rows.issues || []).map((i) => ({ k: i.key, s: i.startDate, d: i.dueDate, du: i.duration, b: i.buffer, p: i.predecessors, o: i._original }))), null, 1);
fs.writeFileSync(new URL("./bed.json", import.meta.url), JSON.stringify({ tag, X, A, B, D, all, jql, planId, planName, tokenId: admin.id, accountId: me.accountId }, null, 2));
