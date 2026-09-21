import { loadEnv } from "../../data/env.mjs";
import { setFields } from "../../data/jira-build.mjs";
loadEnv();
const URL = process.env.LZ_PPM_TESTHOOK_URL, S = process.env.HARNESS_SECRET;
const P = "plan-test-muas0boj-ttkdmu";
const hook = async (q) => { const r = await fetch(`${URL}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${S}` } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const meta = async () => (await hook({ what: "planMeta", planId: P })).meta;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const m0 = await meta();
console.log("T0 summary.finish", m0.summary.finish, "summary.at", m0.summary.at);
const t0 = Date.now();
await setFields("WFH-3733", { duedate: "2026-11-13" });  // E, the finish driver: 11-06 -> 11-13
console.log("jira PUT E due=2026-11-13 at", new Date().toISOString());
let stamps = [];
for (let i = 0; i < 8; i++) {
  await sleep(2500);
  const m = await meta();
  const el = ((Date.now() - t0) / 1000).toFixed(1);
  if (!stamps.length || stamps[stamps.length - 1] !== m.summary.at) { stamps.push(m.summary.at); console.log(`t+${el}s STAMP -> at=${m.summary.at} finish=${m.summary.finish}`); }
  else console.log(`t+${el}s (unchanged) finish=${m.summary.finish}`);
}
const st = await hook({ what: "settle", planId: P });
console.log("SETTLE finish =", st.finish ?? (st.summary && st.summary.finish), "wrote=", st.wrote, "engine=", st.engine);
const m1 = await meta();
console.log("CARD finish =", m1.summary.finish, "| MATCH =", m1.summary.finish === (st.finish ?? (st.summary && st.summary.finish)));
// --- coalescing: two more moves inside 30 s
const atBefore = m1.summary.at;
const t1 = Date.now();
await setFields("WFH-3736", { duedate: "2026-10-12" });  // Z
console.log("jira PUT Z due at", new Date().toISOString());
await sleep(4000);
await setFields("WFH-3731", { duedate: "2026-10-26" });  // C
console.log("jira PUT C due at", new Date().toISOString());
const seen = new Set();
for (let i = 0; i < 20; i++) {
  await sleep(3000);
  const m = await meta();
  if (m.summary.at !== atBefore) seen.add(m.summary.at);
  console.log(`t1+${((Date.now()-t1)/1000).toFixed(1)}s at=${m.summary.at} finish=${m.summary.finish} distinctNewStamps=${seen.size}`);
}
console.log("DISTINCT NEW STAMPS in the 60 s window =", seen.size, [...seen]);
