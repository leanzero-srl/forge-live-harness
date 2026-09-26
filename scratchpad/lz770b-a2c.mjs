import { hook, bed, api } from "./lz770b-lib.mjs";
import { setFields } from "../data/jira-build.mjs";
const b = bed(); const P=b.planId, K=b.c2; // WFH-3703
const tok={url:b.tokenUrl,token:b.token};
console.log("EDIT", JSON.stringify((await hook({what:"applyEdit",planId:P,key:K,field:"dueDate",value:"2026-10-29"})).updated));
await setFields(K, { duedate: "2026-11-02" });
const r = await api(tok,"POST",{resource:"plans",id:P,action:"index"});   // no pause: beat the issue-updated trigger
console.log("INDEX", r.status, r.text.slice(0,120));
for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,2000));const pr=await api(tok,"POST",{resource:"plans",id:P,action:"progress"});if(pr.json?.status==="indexed"){console.log("PROGRESS",JSON.stringify(pr.json));break;}}
const p=await hook({what:"plan",planId:P});
console.log("META",JSON.stringify({savedEdits:p.meta?.savedEdits,editDrops:p.meta?.editDrops,ver:p.meta?.version}));
const i=p.issues.find(x=>x.key===K); console.log("ROW",i.startDate,i.dueDate,i.duration,"| orig",i._original?.dueDate);
