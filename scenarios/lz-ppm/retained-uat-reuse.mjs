import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const reusePins=Object.freeze({journal:'088895c999101331b39830bacc147470035faa02d52176f21f08a6fa247e6896',terminal:'83d48866f87c7fd88be29ac9ae86966f9a72f97d26533b34e8561c82c4b03a6a',main:'plan-test-mtq7hsun-koj1jf',mirror:'plan-test-mtq7hwv8-sk47wf',account:'712020:937bc860-eec2-4294-a65d-8e0fe7c45086'});
const fields=['customfield_11148','customfield_11149'],roles=['E','A','B','L'];
const equal=(a,b)=>assert.deepEqual(a,b);
export function loadUatReuse(input,repo){
 equal(Object.keys(input).sort(),['journalPath','phase','terminalPath']);equal(input.phase,'reuse-owned');
 for(const key of ['journalPath','terminalPath'])assert.ok(typeof input[key]==='string'&&path.isAbsolute(input[key]),'Exact prior file required');
 const journalBytes=fs.readFileSync(input.journalPath),terminalBytes=fs.readFileSync(input.terminalPath);
 equal(sha(journalBytes),reusePins.journal);equal(sha(terminalBytes),reusePins.terminal);
 const prior=JSON.parse(journalBytes),terminal=JSON.parse(terminalBytes);
 equal(terminal.status,'closed');equal(terminal.outcome,'failed');equal(terminal.alivePids,[]);equal(terminal.journal.sha256,reusePins.journal);
 equal(prior.state,'retained-after-failure');equal(prior.stage,'Assets context and failure recovery');equal(prior.retentionPolicy,'retain-experiments');
 equal(prior.plans.main.id,reusePins.main);equal(prior.plans.mirror.id,reusePins.mirror);equal(prior.person.accountId,reusePins.account);
 equal(roles.map(r=>prior.issues[r].key),['WFH-2997','WFH-2998','WFH-2999','WFH-3000']);
 const originalLedger=path.join(repo,'scratch/lz-retained-uat-20260906/ownership.json');equal(sha(fs.readFileSync(originalLedger)),reusePins.journal);
 return {prior,ledgerPath:path.join(repo,'scratch/lz-retained-uat-reuse-20260906/ownership.json'),receipt:{journalSha256:reusePins.journal,terminalSha256:reusePins.terminal,originalLedgerSha256:reusePins.journal}};
}
export function assertOwnedPlan(state,prior,kind){
 const meta=state.meta,owned=prior.plans[kind];assert.ok(meta&&Array.isArray(state.issues),'Complete retained plan required');
 for(const [key,value]of Object.entries({id:owned.id,name:owned.name,createdBy:'harness',createdByName:'harness',calendarKey:'standard',holidayYears:[2026,2027],milestones:[],protectionEnabled:false,members:[],defaultAccess:'none',issueCount:4}))equal(meta[key],value);
 equal(meta.sources,[{id:'src-0',type:'jql',label:'harness',query:prior.jql,boardId:null,projectKey:null}]);
 equal(meta.assets,{fieldIds:fields});assert.ok(['indexed','calculated'].includes(meta.status));assert.ok(Number.isSafeInteger(meta.version)&&meta.version>0);assert.notEqual(meta.assetsIndexPending,true);
 for(const key of ['mode','simulation','fieldOverrides'])assert.ok(meta[key]===undefined,`Unexpected ${key}`);
 equal(state.issues.map(i=>i.key).sort(),prior.admittedJira.map(i=>i.key).sort());
 for(const row of state.issues){const original=prior.admittedJira.find(i=>i.key===row.key),v=original.fields;
  for(const [key,value]of Object.entries({id:original.id,summary:v.summary,startDate:v.customfield_10015,dueDate:v.duedate,duration:v.customfield_10180,buffer:v.customfield_10181.value,parentKey:v.parent?.key||null}))equal(row[key]??null,value);
  equal(row.predecessors||[],original.role==='B'?[prior.issues.A.key]:[]);equal(row.successors||[],original.role==='A'?[prior.issues.B.key]:[]);
  for(const id of fields){const expected=(v[id]||[]).map(x=>({workspaceId:x.workspaceId,objectId:x.objectId})).sort((a,b)=>a.objectId.localeCompare(b.objectId));equal(row.assets?.[id]?.objects||[],expected);assert.ok(expected.length?row.assets[id].state==='present':['empty','unavailable'].includes(row.assets?.[id]?.state));}
 }
 return state;
}
export async function admitUatReuse(f,retained,{hook,get,scheduleFields}){
 const prior=retained.prior,j=f.journal;
 Object.assign(j,{reuseReceipt:retained.receipt,registry:structuredClone(prior.registry),standingSchedule:structuredClone(prior.standingSchedule),issues:structuredClone(prior.issues),plans:structuredClone(prior.plans),admittedJira:structuredClone(prior.admittedJira),jql:prior.jql,person:structuredClone(prior.person)});
 Object.assign(f,{keys:Object.fromEntries(roles.map(r=>[r,prior.issues[r].key])),planId:reusePins.main,mirrorId:reusePins.mirror,person:j.person});f.persist();
 const me=await get('/rest/api/3/myself');equal({accountId:me.accountId,displayName:me.displayName},prior.person);assert.equal(me.active,true);
 const roster=(await hook('lz-ppm',{what:'plans'})).plans;equal(roster.map(p=>p.id).sort(),[...prior.registry,reusePins.main,reusePins.mirror].sort());
 equal(scheduleFields((await hook('lz-ppm',{what:'plan',planId:'plan-msq9dg8l-gz6mz1'})).issues),prior.standingSchedule);
 const mapping=(await hook('lz-ppm',{what:'fieldConfig'})).fields;for(const [key,value]of Object.entries({startDate:'customfield_10015',dueDate:'duedate',duration:'customfield_10180'}))equal(mapping[key],value);
 equal(await f.read(),prior.admittedJira);
 j.reusePlans={};for(const kind of ['main','mirror'])j.reusePlans[kind]=assertOwnedPlan(await hook('lz-ppm',{what:'plan',planId:prior.plans[kind].id}),prior,kind);
 j.state='reuse-source-admitted';f.persist();
 // Same browser-mounted scenario obtains the actual current-user wire; no replay
 // of the prior credential, no direct creation or deletion in this admission.
 f.admitCurrentUser=async invoke=>{
  const actor=await invoke('checkUserRole',{});equal(actor,{success:true,role:'admin',isAdmin:true,accountId:reusePins.account});j.reuseActor=actor;
  const settings=await invoke('getCapacitySettings',{});equal(settings,{success:true,version:68,settings:{selectedPlanIds:[],profiles:{},issueChoices:{}}});j.reuseSettings=settings;
  j.reuseReadiness={};
  for(const kind of ['main','mirror']){const planId=prior.plans[kind].id,result={};
   result.plan=await invoke('getPlan',{planId});equal(result.plan,{success:true,plan:j.reusePlans[kind].meta});
   result.draft=await invoke('getDraft',{planId});equal(result.draft,{success:true,draft:null});
   result.active=await invoke('getActiveDrafts',{planId});equal(result.active,{success:true,drafts:{}});
   for(const name of ['listSnapshots','listSponsorReports']){const value=await invoke(name,{planId});equal(value.success,true);equal(value.entries,[]);equal(value.nextCursor,null);assert.ok(!Object.hasOwn(value,'cursor'));result[name]=value;}
   result.targets=await invoke('getTargets',{planId});equal(result.targets.success,true);equal(result.targets.targets,[]);equal(result.targets.version,j.reusePlans[kind].meta.version);
   result.baseline=await invoke('getBaseline',{planId});equal(result.baseline,{baseline:null});
   // Final complete source read closes the admission interval without mutation.
   equal(await hook('lz-ppm',{what:'plan',planId}),j.reusePlans[kind]);j.reuseReadiness[kind]=result;f.persist();
  }
  equal((await hook('lz-ppm',{what:'plans'})).plans.map(p=>p.id).sort(),[...prior.registry,reusePins.main,reusePins.mirror].sort());
  equal(await f.read(),prior.admittedJira);j.state='admitted';j.reuseAdmissionComplete=true;f.persist();
 };
}
