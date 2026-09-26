import { hook, bed, api } from "./lz770b-lib.mjs";
import { setFields } from "../data/jira-build.mjs";
const b=bed(); const P=b.planId; const tok={url:b.tokenUrl,token:b.token};
// Clean the plan first: clear the stored saved edits so the bed is a plain linked plan.
for (const [k,f] of [[b.l1,"duration"],[b.epic,"duration"],[b.epic,"dueDate"],[b.l1,"dueDate"],[b.l1,"startDate"]]) await hook({what:"applyEdit",planId:P,key:k,field:f,value:""});
await setFields(b.l1, { duedate: null, customfield_10015: null });   // the loose leaf loses BOTH dates in Jira
await new Promise(r=>setTimeout(r,4000));
await api(tok,"POST",{resource:"plans",id:P,action:"index"});
for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,2500));const pr=await api(tok,"POST",{resource:"plans",id:P,action:"progress"});if(pr.json?.status==="indexed"){console.log("PROGRESS",JSON.stringify(pr.json));break;}}
const p=await hook({what:"plan",planId:P});
console.log("META",JSON.stringify({savedEdits:p.meta?.savedEdits,editDrops:p.meta?.editDrops,finish:p.meta?.summary?.finish,digest:p.meta?.summary?.schedDigest,ver:p.meta?.version}));
for(const i of p.issues) console.log(i.key,i.startDate,i.dueDate,i.duration,"| orig",i._original?.startDate,i._original?.dueDate,i._original?.duration);
