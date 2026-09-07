// REHEARSE THE RESTORE BEFORE THE TEST DEPENDS ON IT. Grant a product role by
// REST, read it back, revoke it by REST, read it back. No model, no browser.
import fs from "node:fs"; import path from "node:path";
const SD="/private/tmp/claude-501/-Users-mihaiperdum-Projects-ChatWise/6fbc7d3d-08a3-41d3-9673-62eea36d3527/scratchpad";
const KEY=fs.readFileSync(path.join(SD,".org_key"),"utf8").trim();
const ORGID=fs.readFileSync(path.join(SD,".org_id"),"utf8").trim();
async function org(p,init){const res=await fetch(`https://api.atlassian.com/admin${p.replace("{org}",ORGID)}`,{method:init?.method||"GET",headers:{Authorization:`Bearer ${KEY}`,Accept:"application/json",...(init?.body?{"Content-Type":"application/json"}:{})},...(init?.body?{body:JSON.stringify(init.body)}:{})});
const t=await res.text();let b=t;try{b=JSON.parse(t)}catch{};return{status:res.status,body:b};}
const SUBJ="712020:cecf4c53-ae66-45ff-b4b0-de6e2a18a71b";
const ROLE="atlassian/user-access-admin";
const d=await org("/v2/orgs/{org}/directories"); const dir=d.body?.data?.[0]?.directoryId||d.body?.data?.[0]?.id;
const read=async()=>{const r=await org(`/v2/orgs/{org}/directories/${dir}/users/${SUBJ}/role-assignments`);
  const rows=(r.body?.data||[]); return {status:r.status, has:rows.some(x=>(x.roles||[]).includes(ROLE)),
  where:rows.map(x=>`${x.resourceId}=[${(x.roles||[]).join(",")}]`).join("\n            ")};};
const b=await read(); console.log(`[probe] BEFORE has=${b.has}\n            ${b.where}`);
if(b.has){console.log("[probe] already holds it — pick another role");process.exit(1);}
const RES=(b.where.match(/(ari:cloud:jira-software::site\/[0-9a-f-]+)/)||[])[1];
console.log(`[probe] resource=${RES}`);
for (const shape of [
  ["POST /v1 users/{id}/roles/assign", `/v1/orgs/{org}/users/${SUBJ}/roles/assign`, {role:ROLE, resource:RES}],
]) {
  const r=await org(shape[1],{method:"POST",body:shape[2]});
  console.log(`[probe] ${shape[0]} -> ${r.status} ${JSON.stringify(r.body).slice(0,220)}`);
  if(r.status<300){ const a=await read(); console.log(`[probe] AFTER GRANT has=${a.has}`);
    for (const rv of [
      ["POST /v1 users/{id}/roles/revoke", `/v1/orgs/{org}/users/${SUBJ}/roles/revoke`, {role:ROLE, resource:RES}],
    ]) {
      const x=await org(rv[1],{method:rv[0].startsWith("DELETE")?"DELETE":"POST",body:rv[2]});
      console.log(`[probe] ${rv[0]} -> ${x.status} ${JSON.stringify(x.body).slice(0,220)}`);
      const c=await read(); console.log(`[probe] AFTER REVOKE has=${c.has}`);
      if(!c.has) { console.log("[probe] RESTORE PATH CONFIRMED: "+rv[0]); process.exit(0); }
    }
    console.log("[probe] ⚠️ GRANTED AND COULD NOT REVOKE — take it off by hand"); process.exit(2);
  }
}
console.log("[probe] no grant shape worked; nothing was changed");
