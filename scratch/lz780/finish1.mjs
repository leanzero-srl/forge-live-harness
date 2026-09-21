import { getTransitions, doTransition, get, searchJql } from "../../data/jira.mjs";
import { sleep } from "./rest.mjs";
import fs from "fs";
const toDone = async (key) => { const seen=new Set();
  for(let s=0;s<8;s++){ const t=(await getTransitions(key)).transitions;
    const d=t.find(x=>x.to.statusCategory.key==="done"&&x.to.name!=="Rejected"); if(d){await doTransition(key,d.id);return;}
    const n=t.find(x=>x.to.statusCategory.key==="indeterminate"&&!seen.has(x.to.name)); if(!n)throw new Error("stuck "+key);
    seen.add(n.to.name); await doTransition(key,n.id);} };
const [epic,A,B,C,D,Q,P,U,R]=["WFH-3706","WFH-3707","WFH-3708","WFH-3709","WFH-3710","WFH-3711","WFH-3712","WFH-3713","WFH-3714"];
await toDone(D); await toDone(Q);
const all=[epic,A,B,C,D,Q,P,U,R];
const jql=`key in (${all.join(",")})`;
for (let i=0;i<40;i++){ const found=await searchJql(jql,["summary"],60);
  const ci=await get(`/rest/api/3/issue/${C}?fields=issuelinks`);
  if(found.length===all.length&&(ci.fields.issuelinks||[]).length) break; await sleep(3000);}
fs.writeFileSync(new URL("./bed.json",import.meta.url), JSON.stringify({tag:"LZ780",epic,A,B,C,D,Q,P,U,R,all,jql},null,2));
const st=await searchJql(jql,["summary","status"],60);
console.log(st.map(i=>i.key+" "+i.fields.status.name).join(" | "));
const ci=await get(`/rest/api/3/issue/${C}?fields=issuelinks`);
console.log("C links", JSON.stringify((ci.fields.issuelinks||[]).map(l=>l.type.name+":"+(l.inwardIssue?.key||"")+">"+(l.outwardIssue?.key||""))));
