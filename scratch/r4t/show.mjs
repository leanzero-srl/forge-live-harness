import { rest, hook } from "./rest.mjs";
const P = process.env.PLAN;
const s = await hook(`what=settle&planId=${P}`);
const su = s.meta.summary;
console.log("SUMMARY", JSON.stringify({finish:su.finish,start:su.start,leaves:su.leaves,pct:su.pct,open:su.open,overdue:su.overdue,zeroSlack:su.zeroSlack,roomWd:su.roomWd,targetName:su.targetName,targetDate:su.targetDate,targetsMissed:su.targetsMissed,verdict:su.verdict,milestonesMissed:su.milestonesMissed}));
console.log("wouldMove", (s.changed||[]).length, JSON.stringify((s.changed||[]).map(c=>c.key)));
for (const c of (s.changed||[])) console.log("  CHANGED", c.key, JSON.stringify(c));
const rows = s.issues.map(i=>({key:i.key,sum:i.summary.replace("[harness-test] r4t ",""),st:i.statusCategory,start:i.startDate,due:i.dueDate,dur:i.duration,o:i._original?`${i._original.startDate}->${i._original.dueDate}/${i._original.duration}`:"-",pred:(i.predecessors||[]).map(p=>p.key||p).join(",")}));
console.table(rows);
