// LZ7G0 — WFH bed for the Apply-review HEADING split (0301a09b).
// A -> B -> C chain (a fixed point, so nothing is derived at rest) plus two
// standalone leaves: E (the second date edit) and D (the BUFFER-ONLY change).
// Every duration equals the Mon-Fri span of its own dates, so the browser's
// normaliser re-derives nothing.
//   A 2026-06-01..06-02 (2 wd)  -> B 06-03..06-05 (3 wd) -> C 06-08..06-10 (3 wd)
//   D 2026-06-01..06-05 (5 wd) buffer No     E 2026-06-01..06-03 (3 wd)
import { createIssue, setDates, linkBlocks } from "../../data/jira-build.mjs";
import { get, searchJql } from "../../data/jira.mjs";
import fs from "fs";
const HOOK = process.env.LZ_PPM_TESTHOOK_URL, SEC = process.env.HARNESS_SECRET;
const hook = async (q) => { const r = await fetch(`${HOOK}?${q}`, { headers: { Authorization: `Bearer ${SEC}` } }); const t = await r.text(); try { return JSON.parse(t); } catch { return { status: r.status, text: t.slice(0, 300) }; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fc = (await hook("what=fieldConfig")).fields;
const tok = JSON.parse(fs.readFileSync(new URL("./token.json", import.meta.url), "utf8"));
const mk = async (s) => (await createIssue({ projectKey: "WFH", issueType: "Work package", summary: `[harness-test] LZ7G0 ${s}` })).key;
const A = await mk("A chain head"), B = await mk("B chain mid"), C = await mk("C chain tail"), D = await mk("D buffer leaf"), E = await mk("E date leaf");
console.log("KEYS", A, B, C, D, E);
await setDates(A, { start: "2026-06-01", due: "2026-06-02", duration: 2, buffer: "No" }, fc);
await setDates(B, { start: "2026-06-03", due: "2026-06-05", duration: 3, buffer: "No" }, fc);
await setDates(C, { start: "2026-06-08", due: "2026-06-10", duration: 3, buffer: "No" }, fc);
await setDates(D, { start: "2026-06-01", due: "2026-06-05", duration: 5, buffer: "No" }, fc);
await setDates(E, { start: "2026-06-01", due: "2026-06-03", duration: 3, buffer: "No" }, fc);
await linkBlocks(A, B); await linkBlocks(B, C);
const all = [A, B, C, D, E], jql = `key in (${all.join(",")})`;
for (let i = 0; i < 40; i++) { const f = await searchJql(jql, ["summary"], 10); const bi = await get(`/rest/api/3/issue/${B}?fields=issuelinks`); const ci = await get(`/rest/api/3/issue/${C}?fields=issuelinks`); if (f.length === 5 && (bi.fields.issuelinks || []).length >= 2 && (ci.fields.issuelinks || []).length) break; await sleep(4000); }
const api = async (m, q, b) => { const u = new URL(tok.url); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v); const r = await fetch(u.toString(), { method: m, headers: { Authorization: `Bearer ${tok.token}`, ...(b ? { "Content-Type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t: t.slice(0, 300) }; };
const planName = "LZ7G0 heading bed";
const c = await api("POST", { resource: "plans" }, { name: planName, jql, protectionEnabled: false, wait: 120 });
const planId = c.j?.plan?.id; console.log("PLAN", c.s, planId, c.t.slice(0, 120));
for (let i = 0; i < 24; i++) { const p = await api("GET", { resource: "plans", id: planId }); if (p.j?.plan?.issueCount > 0) { console.log("INDEXED", p.j.plan.issueCount); break; } await sleep(5000); }
const rows = await hook(`what=plan&planId=${planId}`);
console.log((rows.issues || []).map(i => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}|${i.buffer} preds ${JSON.stringify(i.predecessors)} avail ${JSON.stringify(i.fieldAvail)}`).join("\n"));
const st = await hook(`what=settle&planId=${planId}&dry=1`);
console.log("SETTLE_WOULDMOVE", st.wouldMove, JSON.stringify((st.issues || []).map(i => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}`)));
fs.writeFileSync(new URL("./bed.json", import.meta.url), JSON.stringify({ A, B, C, D, E, all, jql, planId, planName }, null, 2));
