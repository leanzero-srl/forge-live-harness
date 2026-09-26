import { hook, bed, api } from "./lz770b-lib.mjs";
import { setFields } from "../data/jira-build.mjs";
const b = bed(); const P=b.planId, L=b.l1;
console.log("EDIT", JSON.stringify(await hook({what:"applyEdit",planId:P,key:L,field:"dueDate",value:"2026-11-18"})));
await setFields(L, { duedate: "2026-11-20" });
await new Promise(r=>setTimeout(r,3000));
const tok={url:b.tokenUrl,token:b.token};
await api(tok,"POST",{resource:"plans",id:P,action:"index"});
for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,2500));const pr=await api(tok,"POST",{resource:"plans",id:P,action:"progress"});if(pr.json?.status==="indexed"){console.log("PROGRESS",JSON.stringify(pr.json));break;}}
const p=await hook({what:"plan",planId:P});
console.log("META",JSON.stringify({savedEdits:p.meta?.savedEdits,editDrops:p.meta?.editDrops,ver:p.meta?.version}));
const i=p.issues.find(x=>x.key===L); console.log("ROW",i.startDate,i.dueDate,i.duration,"| orig",i._original?.dueDate);
