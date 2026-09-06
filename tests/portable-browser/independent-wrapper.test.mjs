// Complete installed wrapper composed with actual adapter and fake local resources.
// No browser, network, session-file loader or identity verifier is executed.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as adapter from '../../forge/portable-browser.mjs';
const require=createRequire(new URL('../../package.json',import.meta.url));
const ts=require('typescript'),source=fs.readFileSync(new URL('../../forge/browser.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function setup(env,errors={}){
 const context=new EventEmitter(),browser=new EventEmitter(),calls=[];
 context.pages=()=>[];context.newPage=async()=>assert.fail('This fake readiness boundary does not create pages');
 context.addInitScript=async()=>{calls.push('suppressor');};context.close=async()=>{calls.push('context-close');context.emit('close');if(errors.context)throw errors.context;};context.browser=()=>browser;
 browser.version=()=>adapter.VERSION;browser.newContext=async opts=>{calls.push(['newContext',opts]);return context;};browser.close=async()=>{calls.push('browser-close');browser.emit('disconnected');if(errors.browser)throw errors.browser;};
 const chromium={launch:async opts=>{calls.push(['launch',opts]);return browser;},launchPersistentContext:async(profile,opts)=>{calls.push(['persistent',profile,opts]);return context;}};
 const portable={...adapter,createPortableLauncher:deps=>adapter.createPortableLauncher({...deps,readAdmission:()=>{calls.push('fake-read');return {cookies:[],origins:[]};},verifyIdentity:async()=>{calls.push('local-ready');if(errors.ready)throw errors.ready;}})};
 const api={},modules={'@playwright/test':{chromium},'./portable-browser.mjs':portable,'./profile-reservation':{launchReservedProfile:async(profile,launch)=>{calls.push('reserve');return launch(profile,'chrome');}},'../config/env':{USER_DATA_DIR:'/unused-local-profile',STORAGE_STATE:'/unused-local-state',HEADLESS:true,VIEWPORT:{width:1200,height:800}}};
 new Function('require','exports','process','console',code)(n=>modules[n]||assert.fail(n),api,{env},{log:msg=>calls.push(['receipt',JSON.parse(msg.slice('HARNESS_BROWSER_RECEIPT '.length))])});
 return {api,calls,context};
}
test('default complete wrapper retains persistent reservation and existing launch options',async()=>{
 const f=setup({});await f.api.launchHarnessContext({headed:true,recordVideoDir:'/owned/local-video'});assert.equal(f.calls[0],'reserve');assert.deepEqual(f.calls[1],['persistent','/unused-local-profile',{channel:'chrome',headless:false,viewport:{width:1200,height:800},args:['--no-first-run','--no-default-browser-check'],recordVideo:{dir:'/owned/local-video',size:{width:1200,height:800}}}]);assert.equal(f.calls.includes('fake-read'),false);
});
test('explicit wrapper composes real adapter receipt, video and full owned cleanup',async()=>{
 const f=setup({LZ_HARNESS_BROWSER_MODE:'portable-chrome152',LZ_EXPECTED_ACCOUNT_ID:'local-placeholder',LZ_EXPECTED_UI_VERSION:'1.2.3'});const ctx=await f.api.launchHarnessContext({recordVideoDir:'/owned/local-video'});
 assert.equal(f.calls.includes('reserve'),false);assert.equal(f.calls[0],'fake-read');assert.equal(f.calls.find(c=>Array.isArray(c)&&c[0]==='newContext')[1].recordVideo.dir,'/owned/local-video');assert.equal(f.api.getHarnessLaunchReceipt(ctx),adapter.getPortableReceipt(ctx));const receipt=f.calls.find(c=>Array.isArray(c)&&c[0]==='receipt')[1];assert.equal(receipt.mode,'portable-chrome152');assert.equal(receipt.browserVersion,adapter.VERSION);assert.equal(JSON.stringify(receipt).includes('local-placeholder'),false);await ctx.close();assert.deepEqual(f.calls.slice(-2),['context-close','browser-close']);
});
test('wrapper never labels or returns failed local adapter admission and keeps cleanup causes',async()=>{
 const original=new Error('local-ready'),ce=new Error('context'),be=new Error('browser'),f=setup({LZ_HARNESS_BROWSER_MODE:'portable-chrome152',LZ_EXPECTED_ACCOUNT_ID:'local-placeholder',LZ_EXPECTED_UI_VERSION:'1.2.3'},{ready:original,context:ce,browser:be});
 await assert.rejects(f.api.launchHarnessContext(),e=>e.errors[0]===original&&e.errors[1].errors[0]===ce&&e.errors[1].errors[1]===be);assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='receipt'),false);assert.equal(f.api.getHarnessLaunchReceipt(f.context),null);
});
test('unknown modes and conflicting explicit choices fail before fake read or either launch',async()=>{
 for(const [env,opts] of [[{LZ_HARNESS_BROWSER_MODE:'unknown'},{}],[{LZ_HARNESS_BROWSER_MODE:''},{}],[{LZ_HARNESS_BROWSER_MODE:'persistent-chrome'},{browserMode:'portable-chrome152'}],[{},{browserMode:'unknown'}]]){const f=setup(env);await assert.rejects(f.api.launchHarnessContext(opts),/BROWSER_MODE_/);assert.deepEqual(f.calls,[]);}
});
