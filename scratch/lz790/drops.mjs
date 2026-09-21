import { loadEnv } from "../../data/env.mjs";
import { setFields } from "../../data/jira-build.mjs";
loadEnv();
const URL = process.env.LZ_PPM_TESTHOOK_URL, S = process.env.HARNESS_SECRET;
const P = "plan-test-muas0boj-ttkdmu";
const hook = async (q) => {
  const r = await fetch(`${URL}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${S}` } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
};
const meta = async () => (await hook({ what: "planMeta", planId: P })).meta;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const m0 = await meta();
console.log("BEFORE savedEdits", JSON.stringify(m0.savedEdits), "editDrops", JSON.stringify(m0.editDrops), "summary.at", m0.summary.at, "finish", m0.summary.finish);

// 1) saved edit on X's dueDate (2026-10-07 -> 2026-10-08)
console.log("applyEdit ->", JSON.stringify(await hook({ what: "applyEdit", planId: P, key: "WFH-3734", field: "dueDate", value: "2026-10-08" })));
// 2) Jira changes THE SAME field
await setFields("WFH-3734", { duedate: "2026-10-09" });
console.log("jira PUT WFH-3734 duedate=2026-10-09 at", new Date().toISOString());
for (let i = 0; i < 20; i++) {
  await sleep(3000);
  const m = await meta();
  const row = ((await hook({ what: "plan", planId: P })).issues || []).find((x) => x.key === "WFH-3734");
  console.log(`t+${(i+1)*3}s editDrops=${JSON.stringify(m.editDrops)} savedEdits=${JSON.stringify(m.savedEdits)} row.due=${row && row.dueDate} orig=${row && row._original.dueDate} summary.at=${m.summary.at}`);
  if (m.editDrops) break;
}
