import { rest, hook, sleep } from "./rest.mjs";
import { deleteIssue } from "../../data/jira-build.mjs";
import { searchJql } from "../../data/jira.mjs";
import fs from "fs";
const bed = JSON.parse(fs.readFileSync(new URL("./bed.json", import.meta.url)));
const plans = [bed.p1, bed.p2, "plan-muapm97x-53otll", "plan-muapknmy-my54sy"].filter((v,i,a)=>v&&a.indexOf(v)===i);
for (const p of plans) {
  for (let i=0;i<6;i++) {
    const r = await rest(`resource=plans&id=${p}`, { method:"DELETE" });
    console.log("DELETE", p, r.status, JSON.stringify(r).slice(0,140));
    if (r.status === 200 || r.status === 404) break;
    await sleep(4000);
  }
}
await sleep(2000);
const list = await hook("what=plans");
console.log("PLANS NOW:", JSON.stringify((list.plans||[]).map(p=>p.name)));
console.log("STILL_EXISTS=", (list.plans||[]).some(p => plans.includes(p.id)));
const keys = [...new Set([...(bed.all||[]), bed.epic2, ...(bed.S||[])].filter(Boolean))];
for (const k of keys) { try { await deleteIssue(k); } catch (e) { console.log("del fail", k, String(e).slice(0,60)); } }
await sleep(4000);
const left = await searchJql('project = WFH AND summary ~ "LZ780"', ["summary"], 60);
console.log("WFH LZ780 ISSUES LEFT:", left.length, JSON.stringify(left.map(i=>i.key)));
