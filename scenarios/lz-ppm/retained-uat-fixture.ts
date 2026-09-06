import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {get,post,put,request,BASE} from '../../data/jira.mjs';
import {requireEnv} from '../../data/env.mjs';
import {LZPT_PLAN,scheduleFields} from './forecast-fixture';

export const UAT_PREFIX='[harness-test] LZ retained UAT 20260906';
export const UAT_LABEL='lz-retained-uat-20260906';
export const UAT_NAMES={main:'[harness-test] UAT 20260906 October release decisions',mirror:'[harness-test] UAT 20260906 October capacity mirror'};
export const ASSET_FIELDS=['customfield_11148','customfield_11149'];
export const ASSET_NAMES=ASSET_FIELDS.map((_,n)=>`[harness-test] LZ Assets owned 20260905 ${n?'gate':'multiple'}`);
export const ASSET_WORKSPACE='be9cca2f-5f41-446f-8f5c-76cda0be8417';
export const assetRef=(objectId:string)=>({workspaceId:ASSET_WORKSPACE,objectId,id:`${ASSET_WORKSPACE}:${objectId}`});
export const profile={hoursPerDay:8,partTimePct:50,reservePct:25,workingDays:[1,2,3,4,5],leaveDates:['2026-10-07']};
export const roles=['E','A','B','L'] as const;
export type Role=typeof roles[number];
const seeds:Record<Role,any>={E:{summary:'October release',type:'10000',start:'2026-10-05',due:'2026-10-16',duration:10,multi:[],gate:[],hours:0},A:{summary:'Delivery preparation',type:'10004',start:'2026-10-05',due:'2026-10-09',duration:5,multi:['411','412'],gate:['411'],hours:8},B:{summary:'Planned reserve',type:'10004',start:'2026-10-12',due:'2026-10-16',duration:5,multi:['412'],gate:['413'],hours:0},L:{summary:'Unrelated late work',type:'10004',start:'2026-10-26',due:'2026-10-30',duration:5,multi:['413'],gate:['413'],hours:8}};
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const ledgerPath=path.join(repo,'scratch/lz-retained-uat-20260906/ownership.json');
// This is the checked-in independent app-doc oracle, not a result imported
// from the live report or a model function called on received data.
const oracleBytes=fs.readFileSync(path.resolve(repo,'../lz-ppm-forge/docs/campaign-2026-09/retained-uat-oracle.json'));
export const oracleSha256=createHash('sha256').update(oracleBytes).digest('hex');
export const oracle=JSON.parse(oracleBytes.toString('utf8'));

export async function createRetainedUat(info:any,{retainExperiments=false}:{retainExperiments?:boolean}={}){
 if(typeof retainExperiments!=='boolean')throw new TypeError('retainExperiments must be a boolean');
 expect(oracleSha256,'independently reviewed oracle bytes must match before any tenant write').toBe('487ac1e69615a8bf56bc30c89eccd42968ac982edef3afd3d1caaae85932da2e');
 expect(BASE).toBe('https://wolfaenpak.atlassian.net');
 expect(new Date().toISOString().slice(0,10)<'2026-10-05','fixed future fixture must run before October5; do not invent past forecast validity').toBe(true);
 fs.mkdirSync(path.dirname(ledgerPath),{recursive:true});fs.mkdirSync(info.outputDir,{recursive:true});
 const unitDir=process.env.LZ_CAMPAIGN_UNIT_DIR?path.resolve(process.env.LZ_CAMPAIGN_UNIT_DIR):null;const mirror=process.env.LZ_RETAINED_UAT_LEDGER?path.resolve(process.env.LZ_RETAINED_UAT_LEDGER):null;if(mirror)expect(unitDir&&mirror.startsWith(unitDir+path.sep),'optional ledger mirror must be inside this attempt').toBeTruthy();
 const beforeIdentitySha256=unitDir?createHash('sha256').update(fs.readFileSync(path.join(unitDir,'before-identity.json'))).digest('hex'):null;
 const journal:any={schema:1,...(retainExperiments?{retentionPolicy:'retain-experiments'}:{}),oracleSha256,state:'admission',startedAt:new Date().toISOString(),ledgerPath,runId:process.env.LZ_CAMPAIGN_RUN_ID||null,unitDir,beforeIdentitySha256,optionalLedger:mirror,noPendingDrafts:false,issues:{},plans:{},steps:[],cleanup:[]};
 // Durable exclusive claim prevents a retry from creating a second retained UAT
 // over an earlier uncertain/retained run. Operator reconciles the ledger first.
 fs.writeFileSync(ledgerPath,JSON.stringify(journal,null,2),{flag:'wx'});
 const persist=()=>{fs.writeFileSync(ledgerPath,JSON.stringify(journal,null,2));fs.writeFileSync(info.outputPath('retained-uat-journal.json'),JSON.stringify(journal,null,2));if(mirror){fs.mkdirSync(path.dirname(mirror),{recursive:true});fs.writeFileSync(mirror,JSON.stringify(journal,null,2));}};persist();
 const f:any={journal,persist,retainExperiments,keys:{},names:UAT_NAMES,planId:null,mirrorId:null};
 f.own=async(role:Role)=>{
  const owned=journal.issues[role];expect(owned?.id,'creation returned an owned actual ID').toBeTruthy();
  const issue=await get(`/rest/api/3/issue/${owned.id}?fields=project,issuetype,summary,labels`);
  expect(issue.id).toBe(owned.id);expect(issue.key).toBe(owned.key);expect(issue.fields.project.key).toBe('WFH');expect(issue.fields.issuetype.id).toBe(seeds[role].type);expect(issue.fields.summary).toBe(owned.summary);expect(issue.fields.labels).toContain(UAT_LABEL);return issue;
 };
 f.read=async()=>{const out=[];for(const role of roles){await f.own(role);const issue=await get(`/rest/api/3/issue/${f.keys[role]}?fields=project,summary,labels,issuetype,parent,issuelinks,status,assignee,timeestimate,customfield_10015,duedate,customfield_10180,customfield_10181,${ASSET_FIELDS.join(',')}`);out.push({role,id:issue.id,key:issue.key,fields:issue.fields});}return out;};
 f.verifySource=async()=>{expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(journal.standingSchedule);expect(await f.read()).toEqual(journal.admittedJira);};
 f.finish=async(retain:boolean)=>{
  const errors:any[]=[];const step=async(name:string,run:()=>Promise<any>)=>{try{await run();journal.cleanup.push({name,ok:true});}catch(e){errors.push(e);journal.cleanup.push({name,ok:false,error:String(e)});}persist();};
  if(retain){await step('owned source and standing schedule unchanged',f.verifySource);}
  else{
   // Reconcile ambiguous creates by unique exact ownership evidence. Searches
   // never license deleting someone else's issue; every candidate is reread.
   await step('reconcile uncertain issue creates',async()=>{const found=await post('/rest/api/3/search/jql',{jql:`project = WFH AND labels = "${UAT_LABEL}"`,fields:['summary','labels','issuetype'],maxResults:100});
    for(const role of roles){const owned=journal.issues[role];if(!owned||owned.id||owned.state==='rejected')continue;const matches=found.issues.filter((i:any)=>i.fields.summary===owned.summary&&i.fields.issuetype.id===seeds[role].type);expect(matches.length,'uncertain create requires exactly one positively owned result; no empty-search assumption').toBe(1);Object.assign(owned,{id:matches[0].id,key:matches[0].key});f.keys[role]=owned.key;persist();}});
   await step('reconcile plan IDs',async()=>{const plans=(await getTestState('lz-ppm',{what:'plans'})).plans;for(const kind of ['main','mirror']){const item=journal.plans[kind];if(!item||item.id)continue;const matches=plans.filter((p:any)=>p.name===item.name&&!journal.registry.includes(p.id));expect(matches.length,'uncertain plan create needs exact owned record').toBe(1);item.id=matches[0].id;persist();}});
   for(const item of Object.values(journal.plans) as any[])if(item.id)await step(`${retainExperiments?'retain owned plan':'delete owned plan'} ${item.id}`,async()=>{const p=await getTestState('lz-ppm',{what:'plan',planId:item.id});expect(p.meta.name).toBe(item.name);if(!retainExperiments){await getTestState('lz-ppm',{what:'clearDrafts',planId:item.id});expect(await getTestState('lz-ppm',{what:'deleteFixture',planId:item.id})).toEqual({deleted:item.id,registryRemoved:true});}});
   for(const role of ['A','B'] as Role[])if(!retainExperiments&&journal.issues[role]?.id)await step(`detach ${role}`,async()=>{await f.own(role);await put(`/rest/api/3/issue/${f.keys[role]}`,{fields:{parent:null}});const detached=await get(`/rest/api/3/issue/${f.keys[role]}?fields=project,summary,parent`);expect(detached.id).toBe(journal.issues[role].id);expect(detached.key).toBe(f.keys[role]);expect(detached.fields.project.key).toBe('WFH');expect(detached.fields.summary).toBe(journal.issues[role].summary);expect(detached.fields.parent||null).toBe(null);});
   for(const role of ['L','B','A','E'] as Role[])if(journal.issues[role]?.id)await step(`${retainExperiments?'retain':'delete'} ${role}`,async()=>{await f.own(role);if(!retainExperiments){await request('DELETE',`/rest/api/3/issue/${f.keys[role]}`);expect((await request('GET',`/rest/api/3/issue/${f.keys[role]}`,{raw:true})).status).toBe(404);}});
  }
  if(journal.registry)await step('registry exact retained delta',async()=>{expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual([...journal.registry,...((retain||retainExperiments)?Object.values(journal.plans).map((p:any)=>p.id):[])].sort());});
  if(journal.standingSchedule)await step('standing schedule unchanged',async()=>expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(journal.standingSchedule));
  if(retainExperiments&&!retain)journal.retainedExperiments={plans:journal.plans,issues:journal.issues,reason:'failed-admission-or-journey'};
  journal.state=errors.length?'recovery-required':retain?'retained':retainExperiments?'retained-after-failure':'cleaned-after-failure';journal.finishedAt=new Date().toISOString();persist();if(errors.length)throw new AggregateError(errors,'Retained UAT cleanup/admission guard failed; exact journal retained');
 };
 try{
  const standing=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});expect(standing.issues).toHaveLength(45);journal.standingSchedule=scheduleFields(standing.issues);const registryPlans=(await getTestState('lz-ppm',{what:'plans'})).plans;journal.registry=registryPlans.map((p:any)=>p.id).sort();persist();expect(registryPlans.some((p:any)=>Object.values(UAT_NAMES).includes(p.name))).toBe(false);
  expect((await getTestState('lz-ppm',{what:'fieldConfig'})).fields).toMatchObject({startDate:'customfield_10015',dueDate:'duedate',duration:'customfield_10180'});
  const types=await get('/rest/api/3/issue/createmeta/WFH/issuetypes');for(const id of ['10000','10004'])expect(types.issueTypes.some((t:any)=>t.id===id)).toBe(true);
  const me=await get('/rest/api/3/myself'),assignable=await get('/rest/api/3/user/assignable/search?project=WFH&maxResults=100');expect(assignable.some((p:any)=>p.active&&p.accountId===me.accountId)).toBe(true);journal.person={accountId:me.accountId,displayName:me.displayName};f.person=journal.person;persist();
  for(const role of roles){const seed=seeds[role],summary=`${UAT_PREFIX} ${seed.summary}`;journal.issues[role]={summary,type:seed.type,state:'create-requested'};persist();
   const response=await fetch(`${BASE}/rest/api/3/issue`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${requireEnv('JIRA_ADMIN_EMAIL')}:${requireEnv('JIRA_API_TOKEN')}`).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({fields:{project:{key:'WFH'},issuetype:{id:seed.type},summary,labels:[UAT_LABEL],...(role==='E'?{customfield_10011:`${UAT_PREFIX} release`}:{})}})});
   const body=await response.json();journal.issues[role].httpStatus=response.status;if(response.status>=400&&response.status<500)journal.issues[role].state='rejected';persist();expect(response.status).toBe(201);expect(body.id).toMatch(/^\d+$/);expect(body.key).toMatch(/^WFH-\d+$/);Object.assign(journal.issues[role],{id:body.id,key:body.key,state:'created'});f.keys[role]=body.key;persist();await f.own(role);
   const edit=(await get(`/rest/api/3/issue/${body.id}/editmeta`)).fields;if(role!=='E')for(const field of ASSET_FIELDS)expect(edit[field],`actual ${role} native field ${field} is applicable`).toBeTruthy();
   await put(`/rest/api/3/issue/${body.key}`,{fields:{customfield_10015:seed.start,duedate:seed.due,customfield_10180:seed.duration,customfield_10181:{value:'No'},assignee:{accountId:me.accountId},timetracking:{originalEstimate:`${seed.hours}h`,remainingEstimate:`${seed.hours}h`},...(role!=='E'?{[ASSET_FIELDS[0]]:seed.multi.map(assetRef),[ASSET_FIELDS[1]]:seed.gate.map(assetRef)}:{}),...(['A','B'].includes(role)?{parent:{key:f.keys.E}}:{})}});
  }
  const linkTypes=(await get('/rest/api/3/issueLinkType')).issueLinkTypes,blocks=linkTypes.find((t:any)=>t.outward.toLowerCase()==='blocks');expect(blocks).toBeTruthy();journal.linkIntent={from:f.keys.A,to:f.keys.B,type:blocks.id};persist();
  // No retrying POST for a link with side effects; unknown replies are retained.
  const link=await fetch(`${BASE}/rest/api/3/issueLink`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${requireEnv('JIRA_ADMIN_EMAIL')}:${requireEnv('JIRA_API_TOKEN')}`).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({type:{id:blocks.id},inwardIssue:{key:f.keys.A},outwardIssue:{key:f.keys.B}})});expect(link.status).toBe(201);
  journal.admittedJira=await f.read();for(const item of journal.admittedJira){const seed=seeds[item.role as Role];expect(item.fields).toMatchObject({customfield_10015:seed.start,duedate:seed.due,customfield_10180:seed.duration,timeestimate:seed.hours*3600,assignee:{accountId:me.accountId},...(item.role!=='E'?{[ASSET_FIELDS[0]]:seed.multi.map(assetRef),[ASSET_FIELDS[1]]:seed.gate.map(assetRef)}:{})});expect(item.fields.status.statusCategory.key).not.toBe('done');}
  const keys=roles.map(r=>f.keys[r]),jql=`key IN (${keys.join(',')}) ORDER BY key ASC`;journal.jql=jql;persist();
  await expect.poll(async()=>{const r=await post('/rest/api/3/search/jql',{jql,fields:['parent','timeestimate','customfield_10015','duedate','customfield_10180'],maxResults:100});return r.issues.map((i:any)=>({key:i.key,parent:i.fields.parent?.key||null,effort:i.fields.timeestimate,start:i.fields.customfield_10015,due:i.fields.duedate,duration:i.fields.customfield_10180})).sort((a:any,b:any)=>a.key.localeCompare(b.key));},{timeout:90000}).toEqual(roles.map(role=>({key:f.keys[role],parent:['A','B'].includes(role)?f.keys.E:null,effort:seeds[role].hours*3600,start:seeds[role].start,due:seeds[role].due,duration:seeds[role].duration})).sort((a,b)=>a.key.localeCompare(b.key)));
  for(const kind of ['main','mirror'] as const){journal.plans[kind]={name:UAT_NAMES[kind],state:'create-requested'};persist();const created=await getTestState('lz-ppm',{what:'createFixture',name:UAT_NAMES[kind],jql});expect(typeof created.planId).toBe('string');expect(journal.registry).not.toContain(created.planId);Object.assign(journal.plans[kind],{id:created.planId,state:'created'});f[kind==='main'?'planId':'mirrorId']=created.planId;persist();
   await expect.poll(async()=>{await getTestState('lz-ppm',{what:'refreshPlan',planId:created.planId});const state=await getTestState('lz-ppm',{what:'plan',planId:created.planId});return state.issues.map((i:any)=>({key:i.key,parent:i.parentKey||null,start:i.startDate,due:i.dueDate,duration:i.duration,predecessors:i.predecessors||[]})).sort((a:any,b:any)=>a.key.localeCompare(b.key));},{timeout:90000}).toEqual(roles.map(role=>({key:f.keys[role],parent:['A','B'].includes(role)?f.keys.E:null,start:seeds[role].start,due:seeds[role].due,duration:seeds[role].duration,predecessors:role==='B'?[f.keys.A]:[]})).sort((a,b)=>a.key.localeCompare(b.key)));
  }
  expect(await f.read()).toEqual(journal.admittedJira);journal.state='admitted';persist();return f;
 }catch(error){journal.failure=String(error);persist();try{await f.finish(false);}catch(cleanup){throw new AggregateError([error,cleanup],'Admission failed; cleanup requires review');}throw error;}
}
