// Additive run-specific guard. The original identity/source guard is imported
// unchanged and must also pass; no global guard or registry exception is changed.
import './campaign-identity.spec';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test,expect} from '../../fixtures/forge';
import {REPO_ROOT} from '../../config/env';
import {getTestState} from '../../testhook/client';
import {get} from '../../data/jira.mjs';
import {openPlans,LZPT_PLAN} from './forecast-fixture';
import {actualResponse,currentUserResolver} from './campaign-ui';

const planId='plan-test-mtozislw-v816ze',issueKey='WFH-2847',versionId='10289',name='[harness-test] lz-norm-mtoziqi3';
const originalIds=[LZPT_PLAN,'plan-mta3aw3t-6dyijd','plan-mtbrlh8n-7ghw8u'];
const journalPath=path.join(REPO_ROOT,'evidence/lz-campaign/sixth-feature-live-20260906/sponsor-report-numeric-live/attempt-001/tests-artifacts/scenarios-lz-ppm-journey-c-adaf3--effort-and-profile-changes-chromium/numeric-report-journal.json');
const hash=(value:any)=>createHash('sha256').update(value).digest('hex');
const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
test('campaign: exact retained numeric diagnostic provenance and restored private preferences are unchanged',async({page})=>{
 const dir=process.env.LZ_CAMPAIGN_UNIT_DIR,phase=process.env.LZ_CAMPAIGN_PHASE;expect(dir).toBeTruthy();expect(['before','after']).toContain(phase);
 const sourceGuard=JSON.parse(fs.readFileSync(path.join(dir!,`${phase}-identity.json`),'utf8'));expect(sourceGuard).toMatchObject({phase,uiVersion:process.env.LZ_EXPECTED_UI_VERSION,issueCount:45,drafts:0,protectionEnabled:false,sourceFingerprint:'2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104'});expect(sourceGuard.planIds).toEqual([...originalIds,planId].sort());const age=Date.now()-Date.parse(sourceGuard.time);expect(Number.isFinite(age)).toBe(true);expect(age).toBeGreaterThanOrEqual(0);expect(age).toBeLessThanOrEqual(120000);
 const raw=fs.readFileSync(journalPath);expect(hash(raw)).toBe('66349d6e67c949c9c1919f174efc035a1b462c57874ddd3677e60a2f49eeadca');const captured=JSON.parse(raw.toString());expect(captured.summary.id).toBe('4fbb1943-7064-4dc1-8faa-e06816c188f6');
 const plans=(await getTestState('lz-ppm',{what:'plans'})).plans;expect(plans.map((p:any)=>p.id).sort()).toEqual([...originalIds,planId].sort());expect(plans.find((p:any)=>p.id===planId).name).toBe(name);
 const detail=await getTestState('lz-ppm',{what:'plan',planId});expect(detail.meta.id).toBe(planId);expect(detail.meta.name).toBe(name);expect(detail.issues).toHaveLength(1);expect(detail.issues[0]).toMatchObject({key:issueKey,summary:name+' numeric report 20h',startDate:'2026-09-07',dueDate:'2026-09-11',duration:5});
 const issue=await get(`/rest/api/3/issue/${issueKey}?fields=project,summary,labels,customfield_10015,duedate,customfield_10180,fixVersions,timeestimate,assignee`);expect(issue.key).toBe(issueKey);expect(issue.id).toMatch(/^\d+$/);expect(issue.fields).toMatchObject({project:{key:'WFH',id:'10001'},summary:name+' numeric report 20h',labels:['lz-norm-mtoziqi3'],customfield_10015:'2026-09-07',duedate:'2026-09-11',customfield_10180:5,timeestimate:72000,assignee:{accountId:captured.capacityRows[0].personId}});expect(issue.fields.fixVersions.map((v:any)=>v.id)).toEqual([versionId]);
 const version=await get(`/rest/api/3/version/${versionId}`);expect(version).toMatchObject({id:versionId,name,projectId:10001,archived:false,released:false});
 const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');
 try{
  const frame=await openPlans(page),pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const preferences=await pending;expect(preferences.success).toBe(true);expect(preferences.settings).toEqual(captured.preferences.original);expect(preferences.version).toBeGreaterThanOrEqual(36);
  const draft=await rpc.invoke('getDraft',{planId}),active=await rpc.invoke('getActiveDrafts',{planId});expect(draft.success).toBe(true);expect(draft.draft).toBeNull();expect(active.success).toBe(true);expect(active.drafts).toEqual({});
  const summary=await rpc.invoke('getSponsorReport',{planId,reportId:captured.summary.id});expect(summary.success).toBe(true);expect(summary.report).toEqual(captured.summary);
  const pages:any[]=[];for(const[section,manifest]of Object.entries(captured.summary.document) as any){expect(manifest.hashes.length).toBe(manifest.sizes.length);expect(manifest.sizes.reduce((sum:number,n:number)=>sum+n,0)).toBe(manifest.total);for(let index=0;index<manifest.hashes.length;index++){const result=await rpc.invoke('getSponsorReportPage',{planId,reportId:captured.summary.id,section,page:index});expect(result.success).toBe(true);expect(result.page).toMatchObject({reportId:captured.summary.id,hash:captured.summary.hash,section,page:index,pageCount:manifest.hashes.length,total:manifest.total,pageHash:manifest.hashes[index]});expect(result.page.rows).toHaveLength(manifest.sizes[index]);expect(hash(JSON.stringify(canonical(result.page.rows)))).toBe(manifest.hashes[index]);pages.push(result.page);}}
  expect(pages.map(p=>p.section).sort()).toEqual(['availability','capacity','targets','timeline']);
  const evidence={time:new Date().toISOString(),phase,planIds:plans.map((p:any)=>p.id).sort(),plan:{name:detail.meta.name,issues:detail.issues,sources:detail.meta.sources},issue,version,summary:summary.report,pages,settings:preferences.settings,settingsVersion:preferences.version,draft:draft.draft,activeDrafts:active.drafts};
  if(phase==='after'){const before=JSON.parse(fs.readFileSync(path.join(dir!,'before-diagnostic-provenance.json'),'utf8'));for(const key of ['planIds','plan','issue','version','summary','pages','settings','draft','activeDrafts'])expect((evidence as any)[key],`Retained diagnostic ${key} unchanged`).toEqual(before[key]);}
  fs.writeFileSync(path.join(dir!,`${phase}-diagnostic-provenance.json`),JSON.stringify(evidence,null,2)+'\n');
 }finally{rpc.stop();}
});
