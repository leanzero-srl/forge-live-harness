// Actual compiled ADDITIVE guard with isolated read-only boundaries. Original
// global guard remains unchanged and is separately discovered/executed live.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import {expect} from '@playwright/test';
import * as crypto from 'node:crypto';
const root=path.resolve('.'),captured=JSON.parse(fs.readFileSync('../lz-ppm-forge/docs/campaign-2026-09/numeric-crash-capture-data.json','utf8'));
const source=fs.readFileSync('scenarios/lz-ppm/campaign-diagnostic-identity.spec.ts','utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const id='plan-test-mtozislw-v816ze',name='[harness-test] lz-norm-mtoziqi3',ids=['plan-msq9dg8l-gz6mz1','plan-mta3aw3t-6dyijd','plan-mtbrlh8n-7ghw8u',id].sort();
async function exercise(mutation,afterMutation){
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'lz-provenance-')),calls=[];let callback;
 const baseline={plans:ids.map(id=>({id,name:id==='plan-test-mtozislw-v816ze'?name:'original'})),detail:{meta:{id,name,sources:[{jql:'key in (WFH-2847)'}]},issues:[{key:'WFH-2847',summary:name+' numeric report 20h',startDate:'2026-09-07',dueDate:'2026-09-11',duration:5}]},issue:{key:'WFH-2847',id:'25047',fields:{project:{key:'WFH',id:'10001'},summary:name+' numeric report 20h',labels:['lz-norm-mtoziqi3'],customfield_10015:'2026-09-07',duedate:'2026-09-11',customfield_10180:5,timeestimate:72000,assignee:{accountId:captured.pages.find(p=>p.section==='capacity').rows[0].personId},fixVersions:[{id:'10289'}]}},version:{id:'10289',name,projectId:10001,archived:false,released:false},preferences:{success:true,version:36,settings:{selectedPlanIds:[],profiles:{},issueChoices:{}}},draft:{success:true,draft:null},active:{success:true,drafts:{}},summary:{success:true,report:captured.summary},pages:structuredClone(captured.pages)};
 const guard={time:new Date().toISOString(),phase:'before',uiVersion:'4.58.579',issueCount:45,drafts:0,protectionEnabled:false,sourceFingerprint:'2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104',planIds:ids};fs.writeFileSync(path.join(out,'before-identity.json'),JSON.stringify(guard));
 mutation?.(baseline,guard);fs.writeFileSync(path.join(out,'before-identity.json'),JSON.stringify(guard));
 const hook=async(app,q)=>{calls.push(q.what);return q.what==='plans'?{plans:baseline.plans}:baseline.detail;};
 const rpc={stop(){},invoke:async(key,q)=>{calls.push(key);if(key==='getDraft')return baseline.draft;if(key==='getActiveDrafts')return baseline.active;if(key==='getSponsorReport')return baseline.summary;if(key==='getSponsorReportPage')return{success:true,page:baseline.pages.find(p=>p.section===q.section&&p.page===q.page)};throw new Error('UNEXPECTED MUTATION '+key);}};
 const deps={test:(name,fn)=>callback=fn,expect,REPO_ROOT:root,getTestState:hook,get:async url=>url.includes('/version/')?baseline.version:baseline.issue,openPlans:async()=>({getByRole:()=>({click:async()=>{}})}),LZPT_PLAN:ids.find(id=>id.includes('msq9')),actualResponse:async()=>baseline.preferences,currentUserResolver:()=>rpc};
 new Function('require','exports',compiled)(name=>name==='node:fs'?fs:name==='node:path'?path:name==='node:crypto'?crypto:deps,{});
 const env={...process.env};process.env.LZ_CAMPAIGN_UNIT_DIR=out;process.env.LZ_CAMPAIGN_PHASE='before';process.env.LZ_EXPECTED_UI_VERSION='4.58.579';
 try{await callback({page:{}});const evidence=JSON.parse(fs.readFileSync(path.join(out,'before-diagnostic-provenance.json'),'utf8'));assert.equal(evidence.pages.length,4);assert.ok(calls.every(c=>['plans','plan','getDraft','getActiveDrafts','getSponsorReport','getSponsorReportPage'].includes(c)));if(afterMutation){
  const before=structuredClone(evidence);afterMutation(before);fs.writeFileSync(path.join(out,'before-diagnostic-provenance.json'),JSON.stringify(before));
  process.env.LZ_CAMPAIGN_PHASE='after';fs.writeFileSync(path.join(out,'after-identity.json'),JSON.stringify({...guard,time:new Date().toISOString(),phase:'after'}));
  await callback({page:{}});const after=JSON.parse(fs.readFileSync(path.join(out,'after-diagnostic-provenance.json'),'utf8'));assert.equal(after.phase,'after');assert.deepEqual(after.pages,evidence.pages);
 }return evidence;}
 finally{process.env=env;fs.rmSync(out,{recursive:true});}
}
test('positive exact retained fixture and every real-shape captured page accepted without writes',async()=>{await exercise();});
for(const[name,mutate]of[
 ['unsuccessful preferences response',d=>d.preferences.success=false],['future global guard',(d,g)=>g.time=new Date(Date.now()+60000).toISOString()],['invalid global guard time',(d,g)=>g.time='invalid'],['extra unowned plan',d=>d.plans.push({id:'foreign'})],['changed issue duration',d=>d.issue.fields.customfield_10180=9],['wrong fixVersion',d=>d.version.name='foreign'],['foreign preferences',d=>d.preferences.settings.selectedPlanIds=['foreign']],['retained unsaved draft',d=>d.draft.draft={id:'draft'}],['nonempty active registry',d=>d.active.drafts={someone:{count:1}}],['wrong array active registry shape',d=>d.active.drafts=[]],['changed report hash',d=>{d.summary=structuredClone(d.summary);d.summary.report.hash='wrong';}],['corrupt actual page content',d=>d.pages[0].rows[0].name='tampered'],['global original source guard wrong',(d,g)=>g.sourceFingerprint='wrong'],
])test(`${name} refuses additive admission`,async()=>{await assert.rejects(exercise(mutate));});

test('actual after phase accepts exact before evidence roundtrip',async()=>{await exercise(undefined,()=>{});});
test('actual after phase rejects changed before evidence',async()=>{await assert.rejects(exercise(undefined,b=>b.version.name='altered retained before receipt'));});
