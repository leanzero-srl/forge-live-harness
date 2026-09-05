import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {expect} from '@playwright/test';
import {CapacitySettingsRecoveryRequired} from '../../scenarios/lz-ppm/capacity-preferences.mjs';
test('actual compiled fixture retains all exact recovery resources and original failure, checks guards, never deletes',async()=>{
 const source=fs.readFileSync(new URL('../../scenarios/lz-ppm/normalization-owned-fixture.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const rows=new Map(),mutations=[],guards=[];let active=false,name;
 const fields={startDate:'customfield_10015',dueDate:'duedate',duration:'customfield_10180'};
 const get=async url=>{if(url.includes('createmeta'))return{issueTypes:[{id:'10004'}]};const key=url.match(/\/issue\/([^?]+)/)?.[1];if(key==='WFH-1990')return{fields:{project:{key:'WFH',id:'10001'},issuetype:{id:'10004'},customfield_10015:null,customfield_10180:null,duedate:null}};assert.ok(rows.has(key));return{key,fields:rows.get(key)};};
 const post=async(url,payload)=>{if(url.includes('search/jql'))return{issues:[...rows].map(([key,fields])=>({key,fields}))};if(url==='/rest/api/3/version'){name=payload.name;return{id:'version-owned',...payload};}assert.equal(url,'/rest/api/3/issue');const key=`WFH-${rows.size+1}`;rows.set(key,payload.fields);return{key};};
 const put=async(url,payload)=>Object.assign(rows.get(url.split('/').at(-1)),payload.fields);
 const hook=async(app,q)=>{guards.push(q);if(q.what==='fieldConfig')return{fields};if(q.what==='plans')return{plans:[{id:'standing'},...(active?[{id:'owned'},{id:'secondary'}]:[])]};if(q.what==='plan')return{meta:{name:q.planId==='owned'?name:name+' secondary'},issues:[]};if(q.what==='createFixture'){active=true;name=q.name;return{planId:'owned',issues:[...rows].map(([key,f])=>({key,startDate:f.customfield_10015,dueDate:f.duedate,duration:f.customfield_10180}))};}mutations.push(q);return{};};
 const request=async(...args)=>{mutations.push(args);return{status:404};};
 const deps={fs,expect,getTestState:hook,openPlan:()=>{},scheduleFields:x=>x,LZPT_PLAN:'standing',waitForIssueReload:()=>{},get,post,put,request,BASE:'https://wolfaenpak.atlassian.net'},exports={};new Function('require','exports',compiled)(n=>n==='node:fs'?fs:deps,exports);
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'lz-settings-retention-'));const bodyError=new CapacitySettingsRecoveryRequired('Foreign current preferences; retained', {lastOwned:{selectedPlanIds:['owned','secondary']},pending:null});let thrown;
 try{await exports.withOwnedSchedule({isClosed:()=>true},{outputDir:out,outputPath:n=>path.join(out,n)},[{label:'one',start:'2026-10-05',due:'2026-10-09',duration:5,release:true}],async f=>{f.retainForRecovery(bodyError,[{id:'secondary',name:f.name+' secondary'}]);throw bodyError;});}catch(e){thrown=e;}
 assert.ok(thrown instanceof AggregateError);assert.ok(thrown.errors.includes(bodyError));assert.deepEqual(mutations,[]);assert.equal(rows.size,1);
 const journal=JSON.parse(fs.readFileSync(path.join(out,'fixture-journal.json'),'utf8'));assert.equal(journal.integrityPassed,false);assert.deepEqual(journal.retainedForRecovery.plans.map(p=>p.id),['owned','secondary']);assert.equal(journal.retainedForRecovery.issues[0].key,'WFH-1');assert.equal(journal.retainedForRecovery.version.id,'version-owned');assert.equal(journal.cleanup.length,0);assert.equal(guards.filter(q=>q.what==='plan'&&q.planId==='standing').length,2);assert.ok(guards.some(q=>q.what==='plan'&&q.planId==='secondary'));fs.rmSync(out,{recursive:true});
});
