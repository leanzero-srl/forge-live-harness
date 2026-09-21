import { loadEnv } from "../../data/env.mjs";
import { setFields } from "../../data/jira-build.mjs";
import { get } from "../../data/jira.mjs";
loadEnv();
const URL = process.env.LZ_PPM_TESTHOOK_URL, S = process.env.HARNESS_SECRET;
const P = "plan-test-muas0boj-ttkdmu";
const hook = async (q) => { const r = await fetch(`${URL}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${S}` } }); return JSON.parse(await r.text()); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await setFields("WFH-3734", { duedate: null, customfield_10015: null });
const j = await get("/rest/api/3/issue/WFH-3734?fields=duedate,customfield_10015");
console.log("JIRA NOW:", JSON.stringify(j.fields));
for (let i = 0; i < 12; i++) {
  await sleep(3000);
  const row = (await hook({ what: "plan", planId: P })).issues.find((x) => x.key === "WFH-3734");
  console.log(`t+${(i+1)*3}s stored start=${row.startDate} due=${row.dueDate}`);
  if (row.startDate == null && row.dueDate == null) break;
}
