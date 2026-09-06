import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPortableLauncher, MODE, VERSION, EXECUTABLE, APP_URL, parsePortableState, verifyPortableIdentity, getPortableReceipt, EXECUTABLE_SHA256, FRAMEWORK_SHA256} from '../../forge/portable-browser.mjs';
const options = () => ({mode:MODE,expected:{accountId:'712020:expected',uiVersion:'4.58.579'},viewport:{width:1600,height:1100},recordVideoDir:'/tmp/owned-video'});
function fixture(overrides={}) {
  const calls=[];
  const context=new EventEmitter();
 context.pages=()=>[];context.newPage=async()=>assert.fail('This fake readiness boundary does not create pages');
  context.close=async opts=>{calls.push(['context-close',opts]);context.emit('close');if(overrides.contextCloseError)throw overrides.contextCloseError;};
  const browser=new EventEmitter();
  browser.version=()=>overrides.version||VERSION;
  browser.newContext=async opts=>{calls.push(['newContext',opts]);if(overrides.newContextError)throw overrides.newContextError;return context;};
  browser.close=async()=>{calls.push(['browser-close']);browser.emit('disconnected');if(overrides.browserCloseError)throw overrides.browserCloseError;};
  const launch=createPortableLauncher({chromium:{launch:async opts=>{calls.push(['launch',opts]);if(overrides.launchError)throw overrides.launchError;return browser;}},
    readAdmission:()=>{calls.push(['state-read']);if(overrides.stateError)throw overrides.stateError;return {cookies:[],origins:[]};},
    installHostFlagSuppressor:async()=>{calls.push(['suppressor']);if(overrides.suppressorError)throw overrides.suppressorError;},
    verifyIdentity:async()=>{calls.push(['identity']);if(overrides.identityError)throw overrides.identityError;}});
  return {launch,calls,browser,context};
}
test('no implicit opt-in or auth-flow admission; no state read or launch',async()=>{
 for(const change of [{mode:undefined},{mode:'chrome'},{authFlow:true},{expected:null},{expected:{accountId:' ',uiVersion:'4.58.579'}},{viewport:{width:0,height:1}}]){
  const f=fixture();await assert.rejects(f.launch({...options(),...change}),/PORTABLE_/);assert.deepEqual(f.calls,[]);
 }
});
test('pinned executable, ephemeral state object, video/viewport and actual suppressor precede identity',async()=>{
 const f=fixture();const ctx=await f.launch(options());
 assert.deepEqual(f.calls.map(c=>c[0]),['state-read','launch','newContext','suppressor','identity']);
 assert.equal(f.calls[1][1].executablePath,EXECUTABLE);assert.equal(f.calls[1][1].headless,true);
 assert.deepEqual(f.calls[2][1],{storageState:{cookies:[],origins:[]},viewport:{width:1600,height:1100},acceptDownloads:true,recordVideo:{dir:'/tmp/owned-video',size:{width:1600,height:1100}}});
 const receipt=getPortableReceipt(ctx);assert.equal(receipt.mode,MODE);assert.equal(receipt.browserVersion,VERSION);assert.equal(receipt.uiVersion,'4.58.579');assert.equal(receipt.executableSha256,EXECUTABLE_SHA256);assert.equal(receipt.frameworkSha256,FRAMEWORK_SHA256);assert.ok(Object.isFrozen(receipt));assert.equal(JSON.stringify(receipt).includes('712020:expected'),false);assert.equal(getPortableReceipt({}),null);
 await assert.rejects(ctx.storageState({path:'/tmp/must-not-write'}),/EXPORT_FORBIDDEN/);
 await Promise.all([ctx.close({reason:'finished'}),ctx.close()]);assert.deepEqual(f.calls.slice(-2).map(c=>c[0]),['context-close','browser-close']);
});
test('runtime mismatch closes browser before any credential context exists',async()=>{
 for(const version of ['151.0.7922.34','152.0.7977.82']) {
  const f=fixture({version});await assert.rejects(f.launch(options()),/VERSION_MISMATCH/);
  assert.deepEqual(f.calls.map(c=>c[0]),['state-read','launch','browser-close']);
 }
});
test('missing state refuses before launch',async()=>{
 const f=fixture({stateError:new Error('state missing')});await assert.rejects(f.launch(options()),/state missing/);assert.deepEqual(f.calls.map(c=>c[0]),['state-read']);
});
test('launch failure retains original error; does not attempt a fallback',async()=>{
 const error=new Error('launch');const f=fixture({launchError:error});await assert.rejects(f.launch(options()),e=>e===error);assert.equal(f.calls.filter(c=>c[0]==='launch').length,1);
});
test('newContext failure still closes owned browser and preserves both errors',async()=>{
 const original=new Error('newContext'),close=new Error('browserClose');const f=fixture({newContextError:original,browserCloseError:close});
 await assert.rejects(f.launch(options()),e=>e instanceof AggregateError&&e.errors[0]===original&&e.errors[1]===close);
});
test('principal/app rejection and both cleanup errors are all retained',async()=>{
 const original=new Error('wrong principal'),one=new Error('contextClose'),two=new Error('browserClose');const f=fixture({identityError:original,contextCloseError:one,browserCloseError:two});
 await assert.rejects(f.launch(options()),e=>e instanceof AggregateError&&e.errors[0]===original&&e.errors[1].errors[0]===one&&e.errors[1].errors[1]===two);
});
test('host suppressor failure cannot return an admitted context',async()=>{
 const f=fixture({suppressorError:new Error('suppressor')});await assert.rejects(f.launch(options()),/suppressor/);assert.equal(f.calls.some(c=>c[0]==='identity'),false);assert.deepEqual(f.calls.slice(-2).map(c=>c[0]),['context-close','browser-close']);
});
test('unexpected context close closes owned browser and is not mistaken for success',async()=>{
 const f=fixture();const ctx=await f.launch(options());ctx.emit('close');await assert.rejects(ctx.close(),/CONTEXT_LOST/);assert.equal(f.calls.filter(c=>c[0]==='browser-close').length,1);
});
test('browser death remains visible at cleanup',async()=>{
 const f=fixture();const ctx=await f.launch(options());f.browser.emit('disconnected');await assert.rejects(ctx.close(),/BROWSER_LOST/);
});
test('malformed state does not expose JSON secret fragments',()=>{
 assert.throws(()=>parsePortableState(Buffer.from('{"secret":"do-not-log')) , e=>e.message==='PORTABLE_STATE_INVALID');
 for(const state of [null,{},[],{cookies:[],origins:null}])assert.throws(()=>parsePortableState(Buffer.from(JSON.stringify(state))),/STATE_INVALID/);
});
function identityFixture(change={}) {
 let url='about:blank';const calls=[];
 const frame={getByRole:(role,opts)=>{assert.equal(role,'heading');assert.deepEqual(opts,{name:'Plans',exact:true});return{waitFor:async()=>calls.push('heading')};},locator:()=>({innerText:async()=>`Plans REV V${change.version||'4.58.579'}`})};
 const page={setDefaultTimeout(){},goto:async target=>{calls.push(target);url=change.login?'https://id.atlassian.com/login':change.route&&target===APP_URL?change.route:target;},url:()=>url,frames:()=>[{url:()=>url}],locator:()=>({first:()=>({waitFor:async()=>{},elementHandle:async()=>({contentFrame:async()=>frame})})}),close:async()=>calls.push('page-close')};
 const context={newPage:async()=>page,request:{get:async target=>{calls.push(target);return{status:()=>change.status||200,json:async()=>({accountId:change.account||'712020:expected',active:change.active??true})};}}};
 return{context,calls};
}
test('actual identity verifier requires exact active account, correct route/stamp and visible Plans',async()=>{
 const f=identityFixture();await verifyPortableIdentity(f.context,options().expected);assert.deepEqual(f.calls,['https://wolfaenpak.atlassian.net/jira/your-work','https://wolfaenpak.atlassian.net/rest/api/3/myself',APP_URL,'heading','page-close']);
});
test('actual verifier rejects login, forbidden principal, inactive account and stale/wrong app',async()=>{
 for(const [change,error] of [[{login:true},/AUTH_INTERACTION/],[{status:401},/PRINCIPAL_UNAVAILABLE/],[{account:'foreign'},/PRINCIPAL_MISMATCH/],[{active:false},/PRINCIPAL_MISMATCH/],[{route:'https://wolfaenpak.atlassian.net/jira/apps/other'},/APP_ROUTE_MISMATCH/],[{version:'4.58.578'},/APP_VERSION_MISMATCH/]]){
  const f=identityFixture(change);await assert.rejects(verifyPortableIdentity(f.context,options().expected),error);assert.equal(f.calls.includes('page-close'),false);
 }
});
