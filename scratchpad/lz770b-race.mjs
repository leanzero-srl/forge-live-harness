// Does the issue-updated TRIGGER eat the saved edit before any rebuild can name it?
import { hook, bed } from "./lz770b-lib.mjs";
import { setFields } from "../data/jira-build.mjs";
const b = bed(); const P=b.planId, K=b.c3; // WFH-3704
const read = async () => { const p=await hook({what:"plan",planId:P}); const i=p.issues.find(x=>x.key===K);
  return { due:i.dueDate, dur:i.duration, orig:i._original?.dueDate, ver:p.meta?.version, drops:p.meta?.editDrops||null }; };
console.log("T0", JSON.stringify(await read()));
console.log("EDIT", JSON.stringify((await hook({what:"applyEdit",planId:P,key:K,field:"dueDate",value:"2026-10-28"})).updated));
console.log("T1", JSON.stringify(await read()));
const t = Date.now();
await setFields(K, { duedate: "2026-10-30" });
console.log("JIRA_SET duedate=2026-10-30 at +0ms");
for (let i=0;i<20;i++) { await new Promise(r=>setTimeout(r,5000)); const s = await read(); console.log(`+${Math.round((Date.now()-t)/1000)}s`, JSON.stringify(s)); if (s.orig === "2026-10-30") break; }
