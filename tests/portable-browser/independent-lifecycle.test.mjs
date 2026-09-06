// Narrowed independent review: pure local lifecycle/config only. No browser or session file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPortableLauncher,MODE,VERSION,getPortableReceipt} from '../../forge/portable-browser.mjs';
const opts={mode:MODE,expected:{accountId:'local-placeholder',uiVersion:'1.2.3'},viewport:{width:800,height:600}};
function fixture({failAt,contextError,browserError,waitContext}={}){
 const browser=new EventEmitter(),context=new EventEmitter(),calls=[];let resolve;
 context.pages=()=>[];context.newPage=async()=>assert.fail('This fake readiness boundary does not create pages');
 const original=new Error('original-local-failure');
 browser.version=()=>VERSION;browser.newContext=async()=>{calls.push('newContext');if(failAt==='newContext')throw original;if(waitContext)await new Promise(r=>resolve=r);return context;};
 browser.close=async()=>{calls.push('browser-close');if(browserError)throw browserError;browser.emit('disconnected');};
 context.close=async()=>{calls.push('context-close');if(contextError)throw contextError;context.emit('close');};
 const launcher=createPortableLauncher({chromium:{launch:async()=>{calls.push('launch');if(failAt==='launch')throw original;return browser;}},readAdmission:()=>{calls.push('read-fake');if(failAt==='read')throw original;return{cookies:[],origins:[]};},installHostFlagSuppressor:async()=>{calls.push('suppressor');if(failAt==='suppressor')throw original;},verifyIdentity:async()=>{calls.push('local-ready');if(failAt==='ready')throw original;}});
 return{launcher,browser,context,calls,original,release:()=>resolve()};
}
test('missing and unknown modes fail before any dependency; explicit mode forwards owned lifecycle',async()=>{
 for(const mode of [undefined,'','unknown','persistent-chrome']){const f=fixture();await assert.rejects(f.launcher({...opts,mode}),/OPT_IN_REQUIRED/);assert.deepEqual(f.calls,[]);}
 const f=fixture();await(await f.launcher(opts)).close();assert.deepEqual(f.calls,['read-fake','launch','newContext','suppressor','local-ready','context-close','browser-close']);
});
test('every early failure preserves original cause and closes each already-created resource',async()=>{
 for(const stage of ['read','launch','newContext','suppressor','ready']){const f=fixture({failAt:stage});await assert.rejects(f.launcher(opts),e=>e===f.original);assert.equal(f.calls.filter(c=>c==='browser-close').length,['newContext','suppressor','ready'].includes(stage)?1:0);assert.equal(f.calls.filter(c=>c==='context-close').length,['suppressor','ready'].includes(stage)?1:0);}
});
test('local readiness failure plus both independent cleanup faults retain all three causes',async()=>{
 const ce=new Error('context-close'),be=new Error('browser-close'),f=fixture({failAt:'ready',contextError:ce,browserError:be});
 await assert.rejects(f.launcher(opts),e=>e instanceof AggregateError&&e.errors[0]===f.original&&e.errors[1].errors[0]===ce&&e.errors[1].errors[1]===be);
});
test('late-created context after browser disconnect is never returned and is still closed',async()=>{
 const f=fixture({waitContext:true}),p=f.launcher(opts);await new Promise(setImmediate);f.browser.emit('disconnected');f.release();await assert.rejects(p);assert.deepEqual(f.calls.slice(-2),['context-close','browser-close']);
});
test('unexpected returned-context loss closes owned browser and remains a failure',async()=>{
 const f=fixture(),ctx=await f.launcher(opts);ctx.emit('close');await assert.rejects(ctx.close(),/CONTEXT_LOST/);assert.equal(f.calls.filter(c=>c==='browser-close').length,1);
});
test('simultaneous repeated close shares one rejection and executes both cleanup attempts exactly once',async()=>{
 const ce=new Error('context-close'),be=new Error('browser-close'),f=fixture({contextError:ce,browserError:be}),ctx=await f.launcher(opts),a=ctx.close(),b=ctx.close();assert.equal(a,b);await assert.rejects(a,e=>e.errors[0]===ce&&e.errors[1]===be);await assert.rejects(b);assert.equal(f.calls.filter(c=>c==='context-close').length,1);assert.equal(f.calls.filter(c=>c==='browser-close').length,1);
});

test('receipt exists only after completed local readiness and exposes no raw fixture configuration',async()=>{
 const failed=fixture({failAt:'ready'});await assert.rejects(failed.launcher(opts));assert.equal(getPortableReceipt(failed.context),null);
 const f=fixture();assert.equal(getPortableReceipt(f.context),null);const ctx=await f.launcher(opts);const receipt=getPortableReceipt(ctx);assert.ok(Object.isFrozen(receipt));assert.equal(receipt.mode,MODE);assert.equal(receipt.browserVersion,VERSION);assert.equal(receipt.uiVersion,opts.expected.uiVersion);assert.match(receipt.principalSha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(receipt).includes('local-placeholder'),false);assert.equal(Object.keys(receipt).some(k=>/cookie|token|storageState/i.test(k)),false);await ctx.close();
});
