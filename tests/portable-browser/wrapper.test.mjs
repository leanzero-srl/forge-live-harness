import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../package.json',import.meta.url));
const ts=require('typescript');
const source=fs.readFileSync(new URL('../../forge/browser.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(env={},receiptPresent=true){
 const calls=[];const receipts=new WeakMap();
 const ctx={browser:()=>({version:()=> '152.0.7977.76'}),close:async()=>calls.push(['close']),storageState:async()=>calls.push(['export']),addInitScript:async()=>{}};
 const exported={};
 const fakeRequire=name=>({
  '@playwright/test':{chromium:{launchPersistentContext:async()=>{calls.push(['persistent-launch']);return ctx;}}},
  './profile-reservation':{launchReservedProfile:async(profile,launch)=>{calls.push(['reservation',profile]);return launch(profile,'chrome');}},
  './portable-browser.mjs':{createPortableLauncher:()=>async opts=>{calls.push(['portable',opts]);if(receiptPresent)receipts.set(ctx,{mode:'portable-chrome152',browserVersion:'152.0.7977.76',principalSha256:'hashed'});return ctx;},getPortableReceipt:c=>receipts.get(c)},
  '../config/env':{USER_DATA_DIR:'/unchanged/profile',STORAGE_STATE:'/unchanged/state',HEADLESS:true,VIEWPORT:{width:1600,height:1100},BASE_URL:'https://example.test',LOGIN_PROBE:'body',LOGIN_URL_RE:/login/}
 }[name]||assert.fail(name));
 new Function('require','exports','process','console',code)(fakeRequire,exported,{env},{log:message=>calls.push(['log',message])});
 return{api:exported,calls,ctx};
}
test('missing mode preserves existing persistent reservation and export',async()=>{
 const f=fixture();const ctx=await f.api.launchHarnessContext();assert.deepEqual(f.calls.slice(0,2).map(c=>c[0]),['reservation','persistent-launch']);assert.equal(f.api.getHarnessLaunchReceipt(ctx).mode,'persistent-chrome');await f.api.exportStorageState(ctx);assert.equal(f.calls.at(-1)[0],'export');
});
test('unknown/empty/conflicting mode rejects before either browser path',async()=>{
 for(const [env,opts]of[[{LZ_HARNESS_BROWSER_MODE:'portable-cft151'},{}],[{LZ_HARNESS_BROWSER_MODE:''},{}],[{LZ_HARNESS_BROWSER_MODE:'unknown'},{}],[{LZ_HARNESS_BROWSER_MODE:'persistent-chrome'},{browserMode:'portable-chrome152'}]]){
  const f=fixture(env);await assert.rejects(f.api.launchHarnessContext(opts),/BROWSER_MODE_/);assert.deepEqual(f.calls,[]);
 }
});
test('portable forwards authoritative identity/video/viewport and never reserves profile',async()=>{
 const f=fixture({LZ_HARNESS_BROWSER_MODE:'portable-chrome152',LZ_EXPECTED_ACCOUNT_ID:'known',LZ_EXPECTED_UI_VERSION:'4.58.579'});
 const ctx=await f.api.launchHarnessContext({recordVideoDir:'/owned/video',headed:true});
 assert.deepEqual(f.calls[0],['portable',{mode:'portable-chrome152',headed:true,authFlow:undefined,viewport:{width:1600,height:1100},recordVideoDir:'/owned/video',expected:{accountId:'known',uiVersion:'4.58.579'}}]);
 assert.equal(f.calls.some(c=>c[0]==='reservation'),false);assert.equal(f.api.getHarnessLaunchReceipt(ctx).mode,'portable-chrome152');
 await assert.rejects(f.api.exportStorageState(ctx),/EXPORT_FORBIDDEN/);assert.equal(f.calls.some(c=>c[0]==='export'),false);
});
test('auth setup opt-in and mismatched account/version reject before launch',async()=>{
 const env={LZ_HARNESS_BROWSER_MODE:'portable-chrome152',LZ_EXPECTED_ACCOUNT_ID:'known',LZ_EXPECTED_UI_VERSION:'4.58.579'};
 for(const opts of [{headed:true,authFlow:true},{expectedAccountId:'foreign'},{expectedUiVersion:'old'}]){
  const f=fixture(env);await assert.rejects(f.api.launchHarnessContext(opts),/FORBIDDEN|MISMATCH/);assert.deepEqual(f.calls,[]);
 }
});
test('unattested portable context is closed and never returned or labelled successful',async()=>{
 const f=fixture({LZ_HARNESS_BROWSER_MODE:'portable-chrome152'},false);await assert.rejects(f.api.launchHarnessContext(),/RECEIPT_MISSING/);assert.equal(f.calls.at(-1)[0],'close');assert.equal(f.api.getHarnessLaunchReceipt(f.ctx),null);
});

test('missing receipt and cleanup failure retain both causes',async()=>{
 const f=fixture({LZ_HARNESS_BROWSER_MODE:'portable-chrome152'},false);const cleanup=new Error('close');f.ctx.close=async()=>{throw cleanup;};
 await assert.rejects(f.api.launchHarnessContext(),e=>e instanceof AggregateError&&e.errors[0].message==='PORTABLE_LAUNCH_RECEIPT_MISSING'&&e.errors[1]===cleanup);
});
