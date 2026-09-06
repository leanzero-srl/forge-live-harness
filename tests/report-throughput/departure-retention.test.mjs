import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const failure=Object.assign(new Error('Owned departure uncertain'),{code:'LZ_REPORT_CAPTURE_RECOVERY_REQUIRED',reportState:{planId:'plan-test-owned',departureFailed:true}});
const expect=value=>({toEqual:other=>assert.deepEqual(value,other),toBe:other=>assert.equal(value,other)});
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function fixture(){const reads=[],journal={planId:'plan-test-owned',issues:[]},standing={issues:[{key:'standing'}]},page={isClosed:()=>false};const getTestState=async(app,q)=>{reads.push(q);if(q.what==='plans')return{plans:[{id:'standing'},{id:'plan-test-owned'}]};if(q.what==='plan')return q.planId==='standing'?standing:{meta:{name:'[harness-test] owner'}};throw new Error('Unexpected mutation '+q.what);};return{reads,journal,standing,page,getTestState};}
test('actual shared fixture finally retains owned plan/issues on departure failure and still reads registry/source',async()=>{
 const s=fs.readFileSync('scenarios/lz-ppm/normalization-owned-fixture.ts','utf8'),a=s.indexOf('    const cleanupErrors:any[]=[];'),b=s.indexOf('\n  }\n}\n\nexport const row',a);assert(a>0&&b>a);const block=transpile(s.slice(a,b));const f=fixture();
 const run=new Function('stopReportUi','reportDepartureFailure','getTestState','expect','scheduleFields','LZPT_PLAN','page','journal','before','registry','name','persist',`return (async()=>{let bodyError,recoveryRetention;${block}})();`);
 await assert.rejects(run(async()=>{throw failure;},()=>failure,f.getTestState,expect,x=>x,'standing',f.page,f.journal,f.standing,['standing'],'[harness-test] owner',()=>{}),/exact owned fixtures retained/);
 assert.equal(f.journal.retainedForRecovery.plans[0].id,'plan-test-owned');assert(f.reads.some(q=>q.what==='plans'));assert(f.reads.some(q=>q.what==='plan'&&q.planId==='standing'));assert(!f.reads.some(q=>['deleteFixture','clearDrafts'].includes(q.what)));
});
test('actual full45 and large custom finalizers poison-dependent deletion but preserve independent audits',async()=>{
 for(const kind of ['full45','large']){const file=kind==='full45'?'journey-campaign-report.spec.ts':'journey-campaign-large-history.spec.ts',s=fs.readFileSync('scenarios/lz-ppm/'+file,'utf8');let a,b;
  if(kind==='full45'){a=s.indexOf('  const failures:any[]=[];journal.cleanup=[];');b=s.indexOf('\n }\n });',a);}else{a=s.indexOf("  observeCall(throughput,'mark','final-cleanup');");b=s.indexOf('\n }\n } catch(error)',a);}assert(a>0&&b>a,file);const block=transpile(s.slice(a,b)),f=fixture();
  const run=new Function('stopReportUi','reportDepartureFailure','cleanupOwnedReportCaptures','getTestState','expect','scheduleFields','LZPT_PLAN','page','journal','standing','source','registry','name','persist','retain','rpc','observeCall','throughput','info',`return (async()=>{let planId='plan-test-owned',reportRecovery,bodyFailure,bodyError;${block}})();`);
  await assert.rejects(run(async()=>{throw failure;},()=>failure,async()=>{throw failure;},f.getTestState,expect,x=>x,'standing',f.page,f.journal,f.standing,f.standing,['standing'],'[harness-test] owner',()=>{},()=>{},{stop(){}},()=>{},null,{}));
  assert.equal(f.journal.retainedForRecovery.planId,'plan-test-owned');assert(f.reads.some(q=>q.what==='plans'));assert(f.reads.some(q=>q.what==='plan'&&q.planId==='standing'));assert(!f.reads.some(q=>['deleteFixture','clearDrafts'].includes(q.what)),kind);
 }
});
test('both actual shared report cleanup stop callbacks use adapter and settle before existing RPC continuation',async()=>{
 const s=fs.readFileSync('scenarios/lz-ppm/report-capture.ts','utf8');const fragments=[...s.matchAll(/stopUi:(async\(\)=>\{await stopReportUi\(page,async\(\)=>\{if\(!page\.isClosed\(\)\)await page\.goto\('about:blank'\);\}\);await session\.settle\(\);\})/g)];assert.equal(fragments.length,2);
 for(const [,fn] of fragments){let settled=0,navigation=0;const make=new Function('stopReportUi','page','session',`return (${fn});`);const stop=make(async()=>{throw failure;},{isClosed:()=>false,goto:async()=>{navigation++;}},{settle:async()=>{settled++;}});await assert.rejects(stop(),e=>e===failure);assert.equal(settled,0);assert.equal(navigation,0);}
});
