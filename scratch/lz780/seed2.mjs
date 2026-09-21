import { createIssue, setDates, linkBlocks } from "../../data/jira-build.mjs";
import { get, searchJql, getTransitions, doTransition } from "../../data/jira.mjs";
import { sleep } from "./rest.mjs";
import fs from "fs";
const fc = { startDate:"customfield_10015", dueDate:"duedate", duration:"customfield_10180", buffer:"customfield_10181" };
const PROJECT = "WFH", tag = "LZ780";
const mk = async (type, summary, fields = {}) =>
  (await createIssue({ projectKey: PROJECT, issueType: type, summary: `[harness-test] ${tag} ${summary}`, fields })).key;
const toDone = async (key) => { const seen=new Set();
  for(let s=0;s<8;s++){ const t=(await getTransitions(key)).transitions;
    const d=t.find(x=>x.to.statusCategory.key==="done"&&x.to.name!=="Rejected"); if(d){await doTransition(key,d.id);return;}
    const n=t.find(x=>x.to.statusCategory.key==="indeterminate"&&!seen.has(x.to.name)); if(!n)throw new Error("stuck "+key);
    seen.add(n.to.name); await doTransition(key,n.id);} };
const toProgress = async (key) => { const t=(await getTransitions(key)).transitions;
  const n=t.find(x=>x.to.statusCategory.key==="indeterminate"); if(!n)throw new Error("no wip "+key); await doTransition(key,n.id); };

const names = ["Extract legacy data","Map reference data","Stand up target schema","Dry-run load 1","Reconcile load 1",
  "Dry-run load 2","Reconcile load 2","Interface rewire","Interface regression","Parallel run",
  "Parallel sign-off","Freeze and final load","Switchover"];
const dates = [["2026-08-10","2026-08-14"],["2026-08-17","2026-08-21"],["2026-08-24","2026-08-28"],["2026-08-31","2026-09-04"],
  ["2026-09-07","2026-09-11"],["2026-09-14","2026-09-18"],["2026-09-21","2026-09-28"],["2026-09-29","2026-10-05"],
  ["2026-10-06","2026-10-12"],["2026-10-13","2026-10-19"],["2026-10-20","2026-10-26"],["2026-10-27","2026-11-02"],
  ["2026-11-03","2026-11-09"]];

const epic2 = await mk("Epic", "Migration wave");
const S = [];
for (let i = 0; i < names.length; i++) S.push(await mk("Work package", `S${i+1} ${names[i]}`, { parent: { key: epic2 } }));
await setDates(epic2, { start: "2026-08-10", due: "2026-11-09", duration: 65, buffer: "No" }, fc);
for (let i = 0; i < S.length; i++) await setDates(S[i], { start: dates[i][0], due: dates[i][1], duration: 5, buffer: "No" }, fc);
for (let i = 0; i < S.length - 1; i++) await linkBlocks(S[i], S[i+1]);
for (const k of S.slice(0, 6)) await toDone(k);
await toProgress(S[6]);

const bed = JSON.parse(fs.readFileSync(new URL("./bed.json", import.meta.url)));
bed.epic2 = epic2; bed.S = S;
bed.all = [...bed.all.filter(k=>!S.includes(k)&&k!==epic2), epic2, ...S];
bed.jql = `key in (${bed.all.join(",")})`;
fs.writeFileSync(new URL("./bed.json", import.meta.url), JSON.stringify(bed, null, 2));
for (let i = 0; i < 60; i++) {
  const found = await searchJql(bed.jql, ["summary"], 60);
  const ci = await get(`/rest/api/3/issue/${S[12]}?fields=issuelinks`);
  if (found.length === bed.all.length && (ci.fields.issuelinks||[]).length) break;
  await sleep(3000);
}
console.log("SEEDED2", epic2, JSON.stringify(S));
