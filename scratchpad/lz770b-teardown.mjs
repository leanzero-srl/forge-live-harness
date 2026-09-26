import { hook, bed, api } from "./lz770b-lib.mjs";
import { deleteIssue } from "../data/jira-build.mjs";
import { searchJql } from "../data/jira.mjs";
const b=bed(); const tok={url:b.tokenUrl,token:b.token};
// 1. delete the plan
const d = await api(tok,"DELETE",{resource:"plans",id:b.planId});
console.log("PLAN_DELETE", d.status, d.text.slice(0,100));
const plans = await hook({what:"plans"});
console.log("STILL_EXISTS", (plans.plans||[]).some(p=>p.id===b.planId));
console.log("LZ770B_PLANS_LEFT", (plans.plans||[]).filter(p=>/LZ770B/.test(p.name)).length);
// 2. delete the issues
for (const k of [b.c1,b.c2,b.c3,b.l1,b.epic]) { try { await deleteIssue(k); console.log("ISSUE_DELETED", k); } catch(e){ console.log("ISSUE_DELETE_ERR", k, String(e).slice(0,120)); } }
await new Promise(r=>setTimeout(r,6000));
for (let i=0;i<20;i++){ const found = await searchJql('project = WFH AND summary ~ "LZ770B"', ["summary"], 50); if (!found.length) { console.log("WFH_LZ770B_REMAINING 0"); break; } console.log("waiting…", found.length, found.map(f=>f.key).join(",")); await new Promise(r=>setTimeout(r,5000)); }
// 3. revoke the token
console.log("TOKEN_REVOKE", JSON.stringify(await hook({what:"revokeApiToken", id:b.tokenId})));
console.log("TOKENS_LEFT", JSON.stringify((await hook({what:"apiTokens"})).tokens?.map(t=>({id:t.id,name:t.name}))));
