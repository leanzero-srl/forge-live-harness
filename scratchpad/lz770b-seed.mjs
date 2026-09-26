// LZ770B bed seed: Epic + 3-chain + 1 loose leaf in WFH, plus a plan via REST.
import { createIssue, setDates, linkBlocks } from "../data/jira-build.mjs";
import { get, searchJql } from "../data/jira.mjs";
import fs from "node:fs";

const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const HOOK = process.env.LZ_PPM_TESTHOOK_URL, SECRET = process.env.HARNESS_SECRET;
const hook = async (q) => {
  const u = new URL(HOOK); for (const [k,v] of Object.entries(q)) u.searchParams.set(k,v);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${SECRET}` } });
  const t = await r.text(); if (!r.ok) throw new Error(`hook ${q.what} ${r.status} ${t.slice(0,300)}`);
  return JSON.parse(t);
};
const PROJECT = "WFH";
const fc = (await hook({ what: "fieldConfig" })).fields;
console.log("FIELDS", JSON.stringify(fc));

const mk = async (summary, type="Work package") => (await createIssue({ projectKey: PROJECT, issueType: type, summary: `[harness-test] LZ770B ${summary}` })).key;
const epic = await mk("Epic — payments hardening", "Epic");
const c1 = await mk("C1 vendor contract");
const c2 = await mk("C2 integration build");
const c3 = await mk("C3 pilot rollout");
const l1 = await mk("L1 comms pack");
console.log("KEYS", { epic, c1, c2, c3, l1 });

await setDates(c1, { start: "2026-10-05", due: "2026-10-09" }, fc);
await setDates(c2, { start: "2026-10-12", due: "2026-10-16" }, fc);
await setDates(c3, { start: "2026-10-19", due: "2026-10-23" }, fc);
await setDates(l1, { start: "2026-11-02", due: "2026-11-06" }, fc);
await setDates(epic, { start: "2026-10-05", due: "2026-11-06" }, fc);
for (const k of [c1,c2,c3,l1]) await (await import("../data/jira-build.mjs")).setFields(k, { parent: { key: epic } });
await linkBlocks(c1, c2); await linkBlocks(c2, c3);

const all = [epic,c1,c2,c3,l1];
const jql = `key in (${all.join(",")})`;
// wait for search index
for (let i=0;i<60;i++) {
  const found = await searchJql(jql, ["summary"], 50);
  if (found.length === all.length) { console.log("INDEXED_IN_JIRA", found.length); break; }
  await new Promise(r=>setTimeout(r,3000));
}
fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(`${OUT}/bed.json`, JSON.stringify({ epic,c1,c2,c3,l1, all, jql, fc }, null, 2));
console.log("SEED_DONE");
