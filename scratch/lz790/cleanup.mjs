import { loadEnv } from "../../data/env.mjs";
import { request, get } from "../../data/jira.mjs";
import { deleteIssue } from "../../data/jira-build.mjs";
import fs from "node:fs";
loadEnv();
const URL = process.env.LZ_PPM_TESTHOOK_URL, S = process.env.HARNESS_SECRET;
const P = "plan-test-muas0boj-ttkdmu";
const hook = async (q) => { const r = await fetch(`${URL}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${S}` } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
// drafts first
console.log("clearDrafts", JSON.stringify((await hook({ what: "clearDrafts", planId: P })).b));
for (let i = 0; i < 6; i++) {
  const d = await hook({ what: "deleteFixture", planId: P });
  console.log("deleteFixture attempt", i, d.s, JSON.stringify(d.b).slice(0, 200));
  if (d.s === 200) break;
  await new Promise((r) => setTimeout(r, 3000));
}
const plans = (await hook({ what: "plans" })).b;
console.log("STILL_EXISTS =", JSON.stringify((plans.plans || plans).some((p) => p.id === P)));
for (const k of ["WFH-3729","WFH-3730","WFH-3731","WFH-3732","WFH-3733","WFH-3734","WFH-3735","WFH-3736","WFH-3737"]) {
  try { await deleteIssue(k); console.log("deleted", k); } catch (e) { console.log("delete FAILED", k, String(e).slice(0, 120)); }
}
const ver = fs.readFileSync("/tmp/lz790ver", "utf8").trim();
try { await request("DELETE", `/rest/api/3/version/${ver}`, { raw: true }); console.log("deleted version", ver); } catch (e) { console.log("version delete failed", String(e).slice(0, 160)); }
const left = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent('project = WFH AND summary ~ "LZ790"')}&fields=key&maxResults=50`);
console.log("LZ790 issues remaining =", (left.issues || []).length, (left.issues || []).map((i) => i.key));
const vs = await get("/rest/api/3/project/WFH/versions");
console.log("WFH versions remaining =", JSON.stringify(vs.map((v) => v.name)));
