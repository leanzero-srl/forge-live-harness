import { loadEnv } from "../../data/env.mjs";
import { setFields } from "../../data/jira-build.mjs";
loadEnv();
const URL = process.env.LZ_PPM_TESTHOOK_URL, S = process.env.HARNESS_SECRET;
const P = "plan-test-muas0boj-ttkdmu";
const hook = async (q) => { const r = await fetch(`${URL}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${S}` } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const meta = async () => (await hook({ what: "planMeta", planId: P })).meta;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log("applyEdit Y.startDate ->", JSON.stringify(await hook({ what: "applyEdit", planId: P, key: "WFH-3735", field: "startDate", value: "2026-10-05" })));
await setFields("WFH-3735", { customfield_10015: "2026-10-07" });
console.log("jira PUT WFH-3735 start=2026-10-07 at", new Date().toISOString());
for (let i = 0; i < 12; i++) {
  await sleep(3000);
  const m = await meta();
  console.log(`t+${(i+1)*3}s editDrops=${JSON.stringify(m.editDrops)}`);
  if (m.editDrops && m.editDrops.count >= 2) break;
}
