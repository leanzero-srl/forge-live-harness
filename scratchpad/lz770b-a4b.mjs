import { hook, bed } from "./lz770b-lib.mjs";
import { setFields } from "../data/jira-build.mjs";
const b = bed(); const P=b.planId, K=b.c1;
const row = async (tag) => { const p=await hook({what:"plan",planId:P}); const i=(p.issues||[]).find(x=>x.key===K);
  console.log(tag, JSON.stringify({due:i.dueDate,dur:i.duration,orig:{d:i._original?.dueDate,dur:i._original?.duration}, ver:p.meta?.version, editDrops:p.meta?.editDrops})); };
await setFields(K, { duedate: "2026-10-20" });
await new Promise(r=>setTimeout(r,4000));
console.log("INCR", JSON.stringify(await hook({what:"incrementalUpdate",key:K})));
await row("AFTER_JIRA_MOVED_INCR");
