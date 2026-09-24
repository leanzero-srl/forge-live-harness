import { hook, bed, api } from "./lz770b-lib.mjs";
const P="plan-msq9dg8l-gz6mz1"; const b=bed(); const tok={url:b.tokenUrl,token:b.token};
for (const k of ["LZPT-209","LZPT-188"]) console.log("CLEAR", k, JSON.stringify(await hook({what:"applyEdit",planId:P,key:k,field:"duration",value:""})));
await api(tok,"POST",{resource:"plans",id:P,action:"index"});
for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,3000));const pr=await api(tok,"POST",{resource:"plans",id:P,action:"progress"});if(pr.json?.status==="indexed"){console.log("PROGRESS",JSON.stringify(pr.json));break;}}
const p=await hook({what:"plan",planId:P});
const ed=p.issues.filter(i=>["startDate","dueDate","duration","buffer"].some(f=>String(i[f]??"")!==String(i._original?.[f]??"")));
console.log("AFTER", JSON.stringify({ver:p.meta?.version,savedEdits:p.meta?.savedEdits,editDrops:p.meta?.editDrops,finish:p.meta?.summary?.finish,digest:p.meta?.summary?.schedDigest,count:p.meta?.issueCount}), "edited:", ed.map(i=>i.key).join(",")||"NONE");
console.log("ROWS", p.issues.filter(i=>["LZPT-209","LZPT-188"].includes(i.key)).map(i=>`${i.key} ${i.startDate}/${i.dueDate}/${i.duration}`).join(" | "));
