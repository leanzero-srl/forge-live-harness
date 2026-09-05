// Actual TypeScript ownership helper, isolated filesystem and fake REST boundary.
// No browser, profile, credentials, Jira or hosted hook is loaded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),{expect}=require('@playwright/test');
const source=fs.readFileSync(new URL('../../scenarios/lz-ppm/retained-uat-fixture.ts',import.meta.url),'utf8');
const oracle=fs.readFileSync(new URL('../../../lz-ppm-forge/docs/campaign-2026-09/retained-uat-oracle.json',import.meta.url),'utf8');
function fixture(mode){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lz-retained-admission-')),repo=path.join(tmp,'harness'),out=path.join(tmp,'out'),app=path.join(tmp,'lz-ppm-forge/docs/campaign-2026-09');fs.mkdirSync(app,{recursive:true});fs.writeFileSync(path.join(app,'retained-uat-oracle.json'),mode==='oracle-drift'?oracle+' ':oracle);
 const calls=[],issues=Array.from({length:45},(_,n)=>({key:`LZPT-${n+1}`}));let deleted=false;
 const get=async uri=>{calls.push(['get',uri]);if(uri.endsWith('/issuetypes'))return{issueTypes:[{id:'10000'},{id:'10004'}]};if(uri.endsWith('/myself'))return{accountId:'actor',displayName:'Actor'};if(uri.includes('/user/assignable/'))return[{accountId:'actor',active:true}];if(uri.endsWith('/editmeta'))throw Error('isolated admission field failure');if(uri.includes('/issue/1?'))return{id:'1',key:'WFH-1',fields:{project:{key:'WFH'},issuetype:{id:'10000'},summary:mode==='foreign'?'Unowned issue':'[harness-test] LZ retained UAT 20260906 October release',labels:['lz-retained-uat-20260906']}};throw Error(`Unexpected fake GET ${uri}`);};
 const jira={BASE:'https://wolfaenpak.atlassian.net',get,post:async uri=>{calls.push(['post',uri]);return{issues:[]};},put:async()=>{throw Error('No edit should occur after failed admission');},request:async(method,uri)=>{calls.push([method,uri]);if(method==='DELETE'){deleted=true;return null;}return{status:deleted?404:200};}};
 const hook={getTestState:async(_,q)=>{calls.push(['hook',q.what]);if(q.what==='plan')return{issues};if(q.what==='plans')return{plans:['a','b','c'].map(id=>({id,name:id}))};if(q.what==='fieldConfig')return{fields:{startDate:'customfield_10015',dueDate:'duedate',duration:'customfield_10180'}};throw Error(`Unexpected fake hook ${q.what}`);}};
 const filename=path.join(repo,'scenarios/lz-ppm/retained-uat-fixture.ts');
 const output=ts.transpileModule(source.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(filename).href)),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};const boundary={
  '../../fixtures/forge':{expect},'../../testhook/client':hook,'../../data/jira.mjs':jira,'../../data/env.mjs':{requireEnv:()=> 'isolated-no-secret'},'./forecast-fixture':{LZPT_PLAN:'standing',scheduleFields:rows=>rows},
 };
 vm.runInNewContext(output,{module,exports:module.exports,require:name=>Object.hasOwn(boundary,name)?boundary[name]:require(name),Buffer,console,Date,URL,AggregateError,process:{env:{}},fetch:async()=>{calls.push(['fetch-create']);if(mode==='unknown')throw Error('ambiguous create reply');return{status:201,json:async()=>({id:'1',key:'WFH-1'})};}},{filename});
 return{api:module.exports,calls,info:{outputDir:out,outputPath:name=>path.join(out,name)},journal:()=>JSON.parse(fs.readFileSync(module.exports.ledgerPath,'utf8')),cleanup:()=>fs.rmSync(tmp,{recursive:true,force:true})};
}
test('failed admission deletes only the positively owned created issue and retains source/registry guards',async()=>{
 const f=fixture('field-failure');try{await assert.rejects(f.api.createRetainedUat(f.info),/isolated admission field failure/);assert.deepEqual(f.calls.filter(c=>c[0]==='DELETE'),[['DELETE','/rest/api/3/issue/WFH-1']]);assert.equal(f.journal().state,'cleaned-after-failure');assert.equal(f.journal().issues.E.id,'1');assert.ok(f.journal().cleanup.every(c=>c.ok));}finally{f.cleanup();}
});
test('an ambiguous create with no searchable positive match fails closed and does not license deletion',async()=>{
 const f=fixture('unknown');try{await assert.rejects(f.api.createRetainedUat(f.info),/Admission failed/);assert.deepEqual(f.calls.filter(c=>c[0]==='DELETE'),[]);assert.equal(f.journal().state,'recovery-required');assert.equal(f.journal().issues.E.state,'create-requested');assert.ok(f.journal().cleanup.some(c=>!c.ok&&c.name==='reconcile uncertain issue creates'));}finally{f.cleanup();}
});
test('ownership mismatch prevents delete even when an earlier create returned that ID',async()=>{
 const f=fixture('foreign');try{await assert.rejects(f.api.createRetainedUat(f.info),/Admission failed/);assert.deepEqual(f.calls.filter(c=>c[0]==='DELETE'),[]);assert.equal(f.journal().state,'recovery-required');}finally{f.cleanup();}
});
test('an existing ledger blocks a second run before any second REST/hook call',async()=>{
 const f=fixture('field-failure');try{await assert.rejects(f.api.createRetainedUat(f.info));const count=f.calls.length;await assert.rejects(f.api.createRetainedUat(f.info),/EEXIST/);assert.equal(f.calls.length,count);}finally{f.cleanup();}
});

test('changed oracle bytes refuse admission before any tenant call or ownership ledger write',async()=>{
 const f=fixture('oracle-drift');try{await assert.rejects(f.api.createRetainedUat(f.info),/independently reviewed oracle bytes/);assert.deepEqual(f.calls,[]);assert.equal(fs.existsSync(f.api.ledgerPath),false);}finally{f.cleanup();}
});
