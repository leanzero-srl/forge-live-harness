import { loadEnv } from "../../data/env.mjs";
import { post, get } from "../../data/jira.mjs";
import { setFields } from "../../data/jira-build.mjs";
import fs from "node:fs";
loadEnv();
const URL = process.env.LZ_PPM_TESTHOOK_URL, S = process.env.HARNESS_SECRET;
const P = "plan-test-muas0boj-ttkdmu";
const hook = async (q) => { const r = await fetch(`${URL}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${S}` } }); return JSON.parse(await r.text()); };
const proj = await get("/rest/api/3/project/WFH");
let versions = await get("/rest/api/3/project/WFH/versions");
let v = versions.find((x) => x.name === "LZ790 R1");
if (!v) v = await post("/rest/api/3/version", { name: "LZ790 R1", projectId: Number(proj.id) });
console.log("version", v.id, v.name);
for (const k of ["WFH-3729", "WFH-3730", "WFH-3737"]) { await setFields(k, { fixVersions: [{ id: String(v.id) }] }); console.log("fixVersion ->", k); }
await new Promise((r) => setTimeout(r, 4000));
console.log("refresh", JSON.stringify(await hook({ what: "refreshPlan", planId: P })).slice(0, 120));
const plan = await hook({ what: "plan", planId: P });
for (const i of plan.issues) if ((i.fixVersions || []).length) console.log("  member", i.key, JSON.stringify(i.fixVersions), i.startDate, i.dueDate);
fs.writeFileSync("/tmp/lz790ver", String(v.id));
