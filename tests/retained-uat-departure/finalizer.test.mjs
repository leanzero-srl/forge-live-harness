import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const file='scenarios/lz-ppm/journey-campaign-retained-uat.spec.ts';
const baseline=execFileSync('git',['show','b5a9710:'+file],{encoding:'utf8'});
const source=process.env.LZ_OLD_UAT_DEPARTURE==='1'?baseline:fs.readFileSync(file,'utf8');
const a=source.lastIndexOf('  const errors:any[]=[];'),b=source.indexOf('\n }',a);
assert(a>0&&b>a);
const block=ts.transpileModule(source.slice(a,b),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const args=['page','f','info','cleanupOwnedReportCaptures','preferences','expect','rpc','crash','sourceGuard','stopReportUi','reportDepartureFailure','options'];
const run=new Function(...args,`return (async()=>{let {passed=false,priorError,originalSettings={},routeHandler=null,documentPage=null}=options;let settingsRestored=false;${block}})();`);
async function fixture(options={}){
 const calls=[],plans={main:{id:'plan-test-main',name:'[harness-test] main'},mirror:{id:'plan-test-mirror',name:'[harness-test] mirror'}},issues={E:{id:'122',key:'WFH-0'},A:{id:'123',key:'WFH-1'},B:{id:'124',key:'WFH-2'},L:{id:'125',key:'WFH-3'}};
 const failure=Object.assign(new Error('Owned report departure failed; exact fixture retained'),{code:'LZ_REPORT_CAPTURE_RECOVERY_REQUIRED',reportState:{planId:plans.main.id,owner:plans.main,departureFailed:true}});
 let poisoned=options.poisoned?failure:null;
 const f={planId:plans.main.id,mirrorId:plans.mirror.id,journal:{plans,issues},persist(){calls.push('persist');},async finish(retain){calls.push(['finish',retain]);}};
 const page={isClosed:()=>false,async goto(){calls.push('blank');},off(){calls.push('off');},async unroute(){calls.push('unroute');}};
 const cleanup=async(_page,_id,_info,opt)=>{calls.push(['report-cleanup',opt.retainPublished]);if(options.cleanupFails){poisoned=failure;opt.onRecovery(failure);throw failure;}};
 const preferences={async restore(){calls.push('preferences');if(options.preferencesFail)throw new Error('Preference restore failed');return{restored:true};}};
 const stop=async()=>{calls.push('safe-stop');if(options.stopFails)poisoned=failure;if(poisoned)throw poisoned;calls.push('back-and-confirmed-leave');await page.goto();};
 let error;try{await run(page,f,{},cleanup,preferences,v=>({toBe:x=>assert.equal(v,x)}),{stop(){calls.push('rpc-stop');}},()=>{},async()=>{calls.push('source-audit');},stop,()=>poisoned,options);}catch(e){error=e;}
 return{f,calls,error,failure,plans,issues};
}
function retained(f){assert(f.error instanceof AggregateError);assert(!f.calls.some(c=>Array.isArray(c)&&c[0]==='finish'));assert.equal(f.f.journal.state,'recovery-required');assert.deepEqual(f.f.journal.reportRecovery,f.failure.reportState);assert.deepEqual(f.f.journal.retainedForRecovery.plans,f.plans);assert.deepEqual(f.f.journal.retainedForRecovery.issues,f.issues);assert(f.calls.includes('preferences'));assert(f.calls.includes('source-audit'));}
test('actual UAT finalizer retains both plans/issues after prior departure failure even without registered capture',async()=>{const f=await fixture({poisoned:true});retained(f);assert(!f.calls.some(c=>Array.isArray(c)&&c[0]==='report-cleanup'));});
test('actual final safe departure failure retains successful UAT and keeps independent audits',async()=>{const f=await fixture({passed:true,stopFails:true});retained(f);assert(f.calls.find(c=>Array.isArray(c)&&c[0]==='report-cleanup')[1]);});
test('cleanup-triggered departure failure stays poisoned through final stop',async()=>retained(await fixture({cleanupFails:true})));
test('original body error and departure error are both retained in AggregateError',async()=>{const priorError=new Error('original body failed'),f=await fixture({priorError,poisoned:true});retained(f);assert(f.error.errors.includes(priorError));assert(f.error.errors.includes(f.failure));});
test('preference failure still audits source and retains ownership',async()=>{const f=await fixture({preferencesFail:true});assert(f.error instanceof AggregateError);assert(!f.calls.some(c=>Array.isArray(c)&&c[0]==='finish'));assert.equal(f.f.journal.state,'recovery-required');assert(f.calls.includes('source-audit'));});
test('safe successful departure preserves retained handoff and exact preference/source order',async()=>{const f=await fixture({passed:true});assert.equal(f.error,undefined);assert.deepEqual(f.calls.filter(c=>Array.isArray(c)),[['report-cleanup',true],['finish',true]]);assert(f.calls.indexOf('preferences')<f.calls.indexOf('safe-stop'));assert(f.calls.indexOf('safe-stop')<f.calls.indexOf('source-audit'));assert.equal(f.calls.filter(c=>c==='blank').length,1);});
test('ordinary body failure without uncertain departure keeps original authorized failure cleanup',async()=>{const f=await fixture();assert.equal(f.error,undefined);assert.deepEqual(f.calls.filter(c=>Array.isArray(c)),[['report-cleanup',false],['finish',false]]);});
function calls(text){const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),values=[];function visit(n){if(ts.isCallExpression(n))values.push(n.getText(tree));ts.forEachChild(n,visit);}visit(tree);return values;}
test('original UAT body, expectations, wait budgets, 503 injection and UI interactions remain exact',()=>{
 const body=text=>text.slice(text.indexOf("  stage('Assets context"),text.indexOf(' }catch(error){priorError='));assert.equal(body(source),body(baseline));
 const selected=text=>calls(text).filter(x=>/^(?:expect(?:\.|\()|.*\.waitFor|.*\.setTimeout|test\.describe\.configure)/.test(x));assert.deepEqual(selected(source),selected(baseline));
 for(const path of ['report-departure.ts','report-document-identity.mjs','report-capture.ts','forecast-fixture.ts','normalization-owned-fixture.ts'])assert.equal(fs.readFileSync('scenarios/lz-ppm/'+path,'utf8'),execFileSync('git',['show','b5a9710:scenarios/lz-ppm/'+path],{encoding:'utf8'}),path);
});
test('UAT alone opts in and binds actual admitted main identity before first Table',()=>{assert.match(source,/await withReportDeparture\(page,info,async\(\)=>\{/);const own=source.indexOf('setReportDepartureOwner(page,f.planId,f.names.main)');const admission=source.indexOf('await createRetainedUat(info,{retainExperiments:true})');assert(admission>=0);assert(own>admission);assert(own<source.indexOf('await table(page,f.names.main)'));assert.equal((source.match(/setReportDepartureOwner\(/g)||[]).length,1);assert.match(source,/await stopReportUi\(page,async\(\)=>\{if\(!page.isClosed\(\)\)await page.goto\('about:blank'\);\}\)/);});

test('intentional retention fixture delta is exactly the separately committed source freeze',()=>{const p='scenarios/lz-ppm/retained-uat-fixture.ts';assert.equal(fs.readFileSync(p,'utf8'),execFileSync('git',['show','764effc:'+p],{encoding:'utf8'}));});
