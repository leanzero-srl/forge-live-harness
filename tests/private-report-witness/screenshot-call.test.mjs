import {withoutRetention} from '../private-retention-mode/source.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import ts from 'typescript';
import {settledScreenshot} from '../../scenarios/lz-ppm/settled-screenshot.mjs';
const source=process.env.LZ_PRIVATE_OLD_SCREENSHOT==='1'?execFileSync('git',['show','ff48d10:scenarios/lz-ppm/campaign-private-staged-report.spec.ts'],{encoding:'utf8'}):fs.readFileSync('scenarios/lz-ppm/campaign-private-staged-report.spec.ts','utf8');
const ast=ts.createSourceFile('actual.ts',source,ts.ScriptTarget.Latest,true);let call;function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='settledScreenshot'){assert.equal(call,undefined);call=n.getText(ast);}ts.forEachChild(n,visit);}visit(ast);assert(call);
const invoke=new Function('documentPage','info','settledScreenshot','return '+call);
class Locator{_apiName='Locator';async _expect(){return {matches:true,log:[],received:true};}async scrollIntoViewIfNeeded(){}async evaluate(){return true;}}
test('actual compiled screenshot call supplies body to unchanged real settledScreenshot boundary',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'private-shot-boundary-')),body=new Locator();let captures=0,locatorCalls=[];const bytes=fs.readFileSync('/Users/mihaiperdum/Projects/lz-ppm-forge/docs/campaign-2026-09/private-owner-root-actual-html.png');
 const documentPage={context(){return {};},locator(name){locatorCalls.push(name);assert.equal(name,'body');return body;},async screenshot(options){captures++;assert.equal(options.fullPage,true);return bytes;}};
 try{const result=await invoke(documentPage,{outputPath:name=>path.join(directory,name)},settledScreenshot);assert.equal(result.nonblank,true);assert.equal(captures,1);assert.deepEqual(locatorCalls,['body']);assert.deepEqual(fs.readFileSync(path.join(directory,'private-owner-report.png')),bytes);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});

const original=execFileSync('git',['show','ff48d10:scenarios/lz-ppm/campaign-private-staged-report.spec.ts'],{encoding:'utf8'});
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const start=source.indexOf("const html=await download('private-owner-report.html');"),end=source.indexOf('\n  frame=await openOwned(privateName);',start);assert(start>0&&end>start);
const block=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const documentFlow=new AsyncFunction('download','page','record','pathToFileURL','expect','settledScreenshot','info','let documentPage;'+block);
async function runDocument(fault){const events=[],calls=[],error=Error('opaque-secret-sentinel');const step=name=>{calls.push(name);if(name===fault)throw error;};const doc={async goto(){step('goto');},locator(name){return name;},async close(){step('close');}};
 const expect=()=>({async toHaveCount(){step('semantic');},async toContainText(){step('semantic');}});
 let thrown;try{await documentFlow(async()=>'/local-report.html',{context:()=>({newPage:async()=>{step('open');return doc;}})},(stage,value)=>events.push({stage,value}),()=>({href:'file:///local-report.html'}),expect,async(target,options)=>{assert.equal(target,doc);assert.equal(options.subject,'body');step('screenshot');},{outputPath:name=>'/local/'+name});}catch(e){thrown=e;}
 return {events,calls,thrown,error};}
test('compiled document flow records only fixed phase boundaries and stops at each exact failed operation',async()=>{
 const steps=['open','goto','semantic','screenshot','close'];const positive=await runDocument(null);assert.equal(positive.thrown,undefined);assert.deepEqual(positive.events,steps.flatMap(step=>['start','complete'].map(event=>({stage:'private-document-step',value:{step,event}}))));
 for(const fault of steps){const r=await runDocument(fault);assert.equal(r.thrown,r.error);assert.deepEqual(r.events.at(-1),{stage:'private-document-step',value:{step:fault,event:'start'}});assert.equal(r.calls.at(-1),fault);assert(!JSON.stringify(r.events).includes('opaque-secret-sentinel'));assert(r.events.every(e=>Object.keys(e.value).sort().join(',')==='event,step'));}
});
test('all original business expectations and waits remain exact; screenshot changes only explicit intended body',()=>{
 const collect=text=>{const ast=ts.createSourceFile('spec.ts',text,ts.ScriptTarget.Latest,true),calls=[];function walk(n){if(ts.isCallExpression(n)&&(/^(await )?expect\(/.test(n.getText(ast))||/\.wait(?:For|\b)/.test(n.expression.getText(ast))))calls.push(n.getText(ast));ts.forEachChild(n,walk);}walk(ast);return calls;};// The separately proved deletion-consumer correction replaces only the obsolete null assertion.
 const newAbsence="await proveDeletedPlanTwice({planId:source.meta.id,expectedRegistry:originals,readPlan:(planId:string)=>hook({what:'plan',planId}),readRegistry:async()=>{const result=await hook({what:'plans'});return result.plans.map((p:any)=>p.id);}});";
 const inventorySource=(source.includes('const retain=privateRetentionMode')?withoutRetention(source):source).replace(newAbsence,"for(let n=0;n<2;n++){expect((await hook({what:'plan',planId:source.meta.id})).meta).toBeNull();await registry(originals);}");
 assert.deepEqual(collect(inventorySource),collect(original));
 assert(original.includes(call.replace("subject:documentPage.locator('body'),",'')));
});
