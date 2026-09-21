// LZ7F0c — the DRIFT-LINE bed on WFH (item 5b). Buffer must be STORABLE, so it
// cannot be LZPT (every LZPT row is field-missing for Duration and Buffer).
//   P 2026-06-01|2026-06-01 1d No  -> Q
//   Q 2026-06-01|2026-06-03 3d No   (P pushes it to 06-02..06-04 => DERIVED)
// Staging ONLY a buffer change on Q must print NO "Jira gets the dates" line.
import { createIssue, setDates, linkBlocks } from "../../data/jira-build.mjs";
import { get, searchJql } from "../../data/jira.mjs";
import fs from "fs";
const HOOK = process.env.LZ_PPM_TESTHOOK_URL, SEC = process.env.HARNESS_SECRET;
const hook = async (q) => { const r = await fetch(`${HOOK}?${q}`, { headers: { Authorization: `Bearer ${SEC}` } }); const t = await r.text(); try { return JSON.parse(t); } catch { return { status: r.status, text: t.slice(0, 300) }; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fc = (await hook("what=fieldConfig")).fields;
const tok = JSON.parse(fs.readFileSync(new URL("./token.json", import.meta.url), "utf8"));
const mk = async (s) => (await createIssue({ projectKey: "WFH", issueType: "Work package", summary: `[harness-test] LZ7F0c ${s}` })).key;
const P = await mk("P pusher"), Q = await mk("Q derived buffer row");
console.log("KEYS", P, Q);
await setDates(P, { start: "2026-06-01", due: "2026-06-01", duration: 1, buffer: "No" }, fc);
await setDates(Q, { start: "2026-06-01", due: "2026-06-03", duration: 3, buffer: "No" }, fc);
await linkBlocks(P, Q);
const jql = `key in (${P},${Q})`;
for (let i = 0; i < 40; i++) { const f = await searchJql(jql, ["summary"], 10); const qi = await get(`/rest/api/3/issue/${Q}?fields=issuelinks`); if (f.length === 2 && (qi.fields.issuelinks || []).length) break; await sleep(4000); }
const api = async (m, q, b) => { const u = new URL(tok.url); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v); const r = await fetch(u.toString(), { method: m, headers: { Authorization: `Bearer ${tok.token}`, ...(b ? { "Content-Type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j }; };
const planName = "LZ7F0c drift bed";
const c = await api("POST", { resource: "plans" }, { name: planName, jql, protectionEnabled: false, defaultAccess: "none", wait: 120 });
const planId = c.j?.plan?.id; console.log("PLAN", c.s, planId);
for (let i = 0; i < 24; i++) { const p = await api("GET", { resource: "plans", id: planId }); if (p.j?.plan?.issueCount > 0) { console.log("INDEXED", p.j.plan.issueCount); break; } await sleep(5000); }
const rows = await hook(`what=plan&planId=${planId}`);
console.log((rows.issues || []).map(i => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}|${i.buffer} preds ${JSON.stringify(i.predecessors)}`).join("\n"));
const st = await hook(`what=settle&planId=${planId}&dry=1`);
console.log("SETTLE", JSON.stringify((st.issues || []).map(i => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}|${i.buffer}`)));
fs.writeFileSync(new URL("./bed2.json", import.meta.url), JSON.stringify({ P, Q, all: [P, Q], jql, planId, planName }, null, 2));
