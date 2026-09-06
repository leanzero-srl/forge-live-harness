import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {execFileSync} from 'node:child_process';
import {privateRetentionMode} from '../../scenarios/lz-ppm/private-retention-mode.mjs';
import {current,retentionParts} from './source.mjs';
const source=current(),parts=retentionParts(source),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const ast=text=>{const a=ts.createSourceFile('a.ts',text,ts.ScriptTarget.Latest,true);return ts.createPrinter({removeComments:true}).printFile(a);};
test('retention is explicit and unknown dispositions fail before registration',()=>{assert.equal(privateRetentionMode(undefined),false);assert.equal(privateRetentionMode(''),false);assert.equal(privateRetentionMode('retain'),true);for(const value of ['cleanup','true',true,1,null])assert.throws(()=>privateRetentionMode(value));});
test('default cleanup branch retains every previous statement; all surrounding business logic is unchanged',()=>{
 const old=execFileSync('git',['show','15e8cb5:scenarios/lz-ppm/campaign-private-staged-report.spec.ts'],{encoding:'utf8'});
 let restored=source.replace("import {privateRetentionMode} from './private-retention-mode.mjs';\n",'').replace("\nconst retain=privateRetentionMode(process.env.LZ_PRIVATE_RETAIN_MODE);",'').replace("...(retain?{retentionMode:'retain'}:{}),",'').replace(parts.branch,parts.cleanup.slice(1,-1));
 assert.equal(ast(restored),ast(old));
});
test('actual compiled retention branch verifies full receipt and rows, persists exact IDs, and dispatches zero cleanup',async()=>{
 const calls=[],job={id:'job',checkpoint:41},summary={id:'report',hash:'report-hash'},snapshot={id:'snapshot',hash:'snapshot-hash'},owner={planId:'sim-owned',plan:{simulationGeneration:'generation'}},source={meta:{id:'plan-test-owned'}},settings={version:68},journal={};
 const run=new AsyncFunction('retain','drafts','read','expect','pages','journal','source','owner','summary','snapshot','finalJob','settings','persist','session','hook','openPlans','page','perform',ts.transpileModule(parts.branch,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
 const forbidden=()=>{throw Error('cleanup dispatched');};
 await run(true,async id=>calls.push('draft:'+id),async(key,payload)=>{calls.push(key);assert.equal(payload.planId,owner.planId);return key==='getSponsorReportCapture'?{success:true,job,report:summary}:{report:summary};},value=>({toEqual:expected=>assert.deepEqual(value,expected)}),async()=>calls.push('pages'),journal,source,owner,summary,snapshot,job,settings,()=>calls.push('persist'),{invoke:forbidden},forbidden,forbidden,{},forbidden);
 assert.deepEqual(calls,['draft:plan-test-owned','draft:sim-owned','getSponsorReportCapture','getSponsorReport','pages','persist']);assert.equal(journal.completed,true);assert.deepEqual(journal.retained,{sourcePlanId:source.meta.id,snapshotId:snapshot.id,snapshotHash:snapshot.hash,privatePlanId:owner.planId,generationId:'generation',reportId:summary.id,reportHash:summary.hash,jobId:job.id,checkpoint:41,settingsVersion:68});for(const key of ['sourceDeleted','privateDeleted','reportDeleted'])assert.equal(journal[key],undefined);
});
test('retention refuses each failed preservation read without marking retained or reaching cleanup',async()=>{
 const run=new AsyncFunction('retain','drafts','read','expect','pages','journal','source','owner','summary','snapshot','finalJob','settings','persist','session','hook','openPlans','page','perform',ts.transpileModule(parts.branch,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
 for(const fault of ['draft','receipt','report','pages']){const journal={},failure=Error(fault),job={id:'job'},summary={id:'report'},calls=[];const forbidden=()=>{calls.push('cleanup');throw Error('cleanup');};
 await assert.rejects(run(true,async()=>{if(fault==='draft')throw failure;},async key=>{if(fault==='receipt'&&key==='getSponsorReportCapture'||fault==='report'&&key==='getSponsorReport')throw failure;return key==='getSponsorReportCapture'?{success:true,job,report:summary}:{report:summary};},v=>({toEqual:e=>assert.deepEqual(v,e)}),async()=>{if(fault==='pages')throw failure;},journal,{meta:{id:'source'}},{planId:'private',plan:{}},summary,{id:'snapshot'},job,{version:68},()=>{}, {invoke:forbidden},forbidden,forbidden,{},forbidden),e=>e===failure);assert.equal(journal.retained,undefined);assert.equal(journal.completed,undefined);assert.deepEqual(calls,[]);}
});
test('actual final roster requires exact new source/private IDs and rejects extras or absent retained content',async()=>{
 const fragment=source.match(/async\(\)=>\{const ids=\[\.\.\.originals,[\s\S]*?await registry\(ids\);\}/)?.[0];assert(fragment);
 const make=new Function('journal','originals','registry','return '+fragment),originals=['one','two','three'],journal={owned:{sourcePlanId:'owned-source'},observedPrivatePlanId:'owned-private'};
 const expected=[...originals,'owned-source','owned-private'];await make(journal,originals,async ids=>assert.deepEqual(ids,expected))();
 for(const actual of [originals,[...expected,'foreign'],expected.slice(0,-1)])await assert.rejects(make(journal,originals,async ids=>assert.deepEqual(ids,actual))());
});
