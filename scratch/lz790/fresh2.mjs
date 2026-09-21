import { loadEnv } from "../../data/env.mjs";
import { setFields } from "../../data/jira-build.mjs";
loadEnv();
const URL = process.env.LZ_PPM_TESTHOOK_URL, S = process.env.HARNESS_SECRET;
const P = "plan-test-muas0boj-ttkdmu";
const hook = async (q) => { const r = await fetch(`${URL}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${S}` } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const meta = async () => (await hook({ what: "planMeta", planId: P })).meta;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let m = await meta();
let age = (Date.now() - Date.parse(m.summary.at)) / 1000;
console.log("stamp age at start:", age.toFixed(1), "s — waiting for >35 s");
while (age < 35) { await sleep(3000); m = await meta(); age = (Date.now() - Date.parse(m.summary.at)) / 1000; }
console.log("WINDOW OPEN. finish before =", m.summary.finish, "at =", m.summary.at, "age", age.toFixed(1));
const before = m.summary.at;
const t0 = Date.now();
await setFields("WFH-3733", { duedate: "2026-11-20" });  // E: 11-13 -> 11-20
console.log("jira PUT E due=2026-11-20 at", new Date().toISOString());
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const mm = await meta();
  if (mm.summary.at !== before) { console.log(`RE-STAMP after ${((Date.now()-t0)/1000).toFixed(1)}s -> at=${mm.summary.at} finish=${mm.summary.finish}`); break; }
  if (i % 3 === 2) console.log(`  t+${((Date.now()-t0)/1000).toFixed(1)}s still ${mm.summary.finish}`);
}
const st = await hook({ what: "settle", planId: P });
const mm = await meta();
console.log("SETTLE finish =", st.finish, "| CARD finish =", mm.summary.finish, "| MATCH =", st.finish === mm.summary.finish);
