import { hook, bed, api } from "./lz770b-lib.mjs";
const P="plan-msq9dg8l-gz6mz1"; const b=bed(); const tok={url:b.tokenUrl,token:b.token};
const look = async (tag) => { const p=await hook({what:"plan",planId:P});
  const ed=p.issues.filter(i=>["startDate","dueDate","duration","buffer"].some(f=>String(i[f]??"")!==String(i._original?.[f]??"")));
  console.log(tag, JSON.stringify({ver:p.meta?.version,savedEdits:p.meta?.savedEdits,editDrops:p.meta?.editDrops,finish:p.meta?.summary?.finish,digest:p.meta?.summary?.schedDigest}), "edited:", ed.map(i=>`${i.key}:${i.duration}/${i._original?.duration}`).join(",")||"none"); };
await look("BEFORE_INDEX");
await api(tok,"POST",{resource:"plans",id:P,action:"index"});
for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,3000));const pr=await api(tok,"POST",{resource:"plans",id:P,action:"progress"});if(pr.json?.status==="indexed"){console.log("PROGRESS",JSON.stringify(pr.json));break;}}
await look("AFTER_INDEX(carry pins it?)");
