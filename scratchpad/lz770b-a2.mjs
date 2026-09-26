import { hook, bed, api } from "./lz770b-lib.mjs";
import { setFields } from "../data/jira-build.mjs";
import { get } from "../data/jira.mjs";
const b = bed(); const P=b.planId, K=b.c1;
await setFields(K, { duedate: "2026-10-14" });
const j = await get(`/rest/api/3/issue/${K}?fields=duedate,customfield_10015,customfield_10180`);
console.log("JIRA_NOW", JSON.stringify(j.fields));
const tok={url:b.tokenUrl,token:b.token};
await api(tok,"POST",{resource:"plans",id:P,action:"index"});
for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,3000));const pr=await api(tok,"POST",{resource:"plans",id:P,action:"progress"});if(pr.json?.status==="indexed"){console.log("PROGRESS",JSON.stringify(pr.json));break;}}
const p = await hook({what:"plan",planId:P});
const i=(p.issues||[]).find(x=>x.key===K);
console.log("ROW", JSON.stringify({start:i.startDate,due:i.dueDate,dur:i.duration,orig:i._original}));
console.log("META", JSON.stringify({savedEdits:p.meta?.savedEdits, editDrops:p.meta?.editDrops, contentHash:p.meta?.contentHash, version:p.meta?.version, finish:p.meta?.summary?.finish}));
const prog = await api(tok,"POST",{resource:"plans",id:P,action:"progress"});
console.log("GETINDEXINGPROGRESS_FULL", prog.text.slice(0,800));
