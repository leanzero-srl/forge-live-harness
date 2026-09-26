import { hook, bed, api } from "./lz770b-lib.mjs";
import { setDates } from "../data/jira-build.mjs";
const b=bed(); const P=b.planId; const tok={url:b.tokenUrl,token:b.token};
await setDates(b.l1, { start:"2026-11-02", due:"2026-11-06" }, b.fc);
await new Promise(r=>setTimeout(r,4000));
await api(tok,"POST",{resource:"plans",id:P,action:"index"});
for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,2500));const pr=await api(tok,"POST",{resource:"plans",id:P,action:"progress"});if(pr.json?.status==="indexed"){console.log("PROGRESS",JSON.stringify(pr.json));break;}}
const p=await hook({what:"plan",planId:P});
console.log("META",JSON.stringify({savedEdits:p.meta?.savedEdits,finish:p.meta?.summary?.finish,digest:p.meta?.summary?.schedDigest,ver:p.meta?.version}));
for(const i of p.issues) console.log(i.key,JSON.stringify([i.startDate,i.dueDate,i.duration]));
