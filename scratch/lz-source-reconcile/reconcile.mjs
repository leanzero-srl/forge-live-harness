import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadEnv} from '../../data/env.mjs';
import {post,get,BASE} from '../../data/jira.mjs';
loadEnv();
assert.equal(BASE,'https://wolfaenpak.atlassian.net');
const out='evidence/lz-campaign/third-feature-live-20260905/source-reconciliation';fs.mkdirSync(out,{recursive:true});
const save=(n,v)=>fs.writeFileSync(`${out}/${n}.json`,JSON.stringify(v,null,2)+'\n');
const planId='plan-msq9dg8l-gz6mz1';
async function hook(what){const url=new URL(process.env.LZ_PPM_TESTHOOK_URL);url.searchParams.set('what',what);url.searchParams.set('planId',planId);const r=await fetch(url,{headers:{Authorization:`Bearer ${process.env.HARNESS_SECRET}`}});assert.equal(r.status,200);return r.json();}
const originalKeys=Array.from({length:45},(_,n)=>`LZPT-${186+n}`).sort();
const shape=issues=>issues.map(({key,startDate,dueDate,duration,buffer,predecessors,successors,parentKey})=>({key,startDate,dueDate,duration,buffer,predecessors,successors,parentKey})).sort((a,b)=>a.key.localeCompare(b.key));
const source=p=>({issues:shape(p.issues),sources:p.meta.sources,calendarKey:p.meta.calendarKey,holidayYears:p.meta.holidayYears,milestones:p.meta.milestones,protectionEnabled:p.meta.protectionEnabled});
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const before=await hook('plan');save('before-cached',before);assert.equal(before.issues.length,51);
const original={...before,issues:before.issues.filter(i=>originalKeys.includes(i.key))};
assert.equal(hash(source(original)),'2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104');
const fields=['customfield_10015','duedate','customfield_10180','customfield_10181','summary'];
const read=async()=>{const r=await post('/rest/api/3/search/jql',{jql:'project=LZPT ORDER BY key ASC',fields,maxResults:100});assert.equal(r.isLast,true);assert.deepEqual(r.issues.map(i=>i.key).sort(),originalKeys);return r.issues;};
const jiraBefore=await read();save('jira-before',jiraBefore);
const refreshed=await hook('refreshPlan');save('refresh-result',refreshed);
const after=await hook('plan');save('after-cached',after);
assert.deepEqual(after.issues.map(i=>i.key).sort(),originalKeys);assert.equal(after.meta.issueCount,45);
assert.deepEqual(source(after),source(original));
const jiraAfter=await read();save('jira-after',jiraAfter);assert.deepEqual(jiraAfter,jiraBefore);
for(const row of [jiraAfter[0],jiraAfter.at(-1)]){const actual=await get(`/rest/api/3/issue/${row.key}?fields=${fields.join(',')}`);assert.deepEqual(actual.fields,row.fields);}
const result={time:new Date().toISOString(),planId,beforeCachedCount:51,actualJiraBeforeCount:45,afterCachedCount:45,sourceFingerprint:hash(source(after)),original45ExactlyPreserved:true,jiraBeforeAfterExactlyUnchanged:true,removedCachedForeignKeys:before.issues.filter(i=>!originalKeys.includes(i.key)).map(i=>i.key).sort(),refresh:refreshed};save('result',result);console.log(JSON.stringify(result));
