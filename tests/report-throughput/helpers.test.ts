import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createReportThroughputObserver} from '../../scenarios/lz-ppm/report-throughput-observer.mjs';
process.env.LZ_PPM_TESTHOOK_URL='https://example.invalid/owned-hook';process.env.HARNESS_SECRET='synthetic-private-secret';
const {currentUserResolver}=await import('../../scenarios/lz-ppm/campaign-ui');
const {getTestState}=await import('../../testhook/client');
const extensionId='ari:cloud:ecosystem::extension/app/env/static/ppm-dashboard';
function wire(){return {url:()=> 'https://example.invalid/gateway/api/graphql',postDataBuffer:()=>Buffer.from(JSON.stringify({variables:{input:{extensionId,payload:{contextToken:'synthetic-context-token',call:{functionKey:'captureSnapshot',payload:{planId:'p'}}}}}})),allHeaders:async()=>({'content-type':'application/json'})};}
function setup(post:any){const page:any=new EventEmitter();page.request={post};const records:any[]=[];const observer=createReportThroughputObserver({page,extensionId,emit:e=>records.push(e)});return {page,observer,records};}

test('actual direct RPC seam dispatches once and preserves values/default body consumption',async()=>{
 for(const enabled of [false,true]){
  const calls:any[]=[],expected={success:true,page:{rows:[{key:'owned'}]}};const raw=JSON.stringify({data:{invokeExtension:{success:true,response:{body:expected}}}});
  const f=setup(async(url:any,options:any)=>{calls.push(['post',url,JSON.parse(options.data).variables.input.payload.call]);return {status:()=>200,json:async()=>{calls.push(['json']);return JSON.parse(raw);},text:async()=>{calls.push(['observed-text']);return raw;}};});
  const rpc=currentUserResolver(f.page,()=>true,enabled?{observer:f.observer}:{});f.page.emit('request',wire());assert.deepEqual(await rpc.invoke('getSponsorReportPage',{planId:'p'}),expected);rpc.stop();
  assert.equal(calls.filter(c=>c[0]==='post').length,1);assert.equal(calls.filter(c=>c[0]==='json').length,1);assert.equal(calls.filter(c=>c[0]==='observed-text').length,enabled?1:0);
  // The seed request only supplies the template; its fake response is not part of this helper test.
  const direct=f.observer.snapshot().records.filter(r=>r.kind==='rpc');assert.equal(direct.length,enabled?1:0);assert.doesNotMatch(JSON.stringify(direct),/synthetic-context-token/);
  await f.observer.finish();
 }
});

test('actual direct RPC rejection identity and falsy exception survive observation',async()=>{
 for(const failure of [new Error('network sentinel'),0,null])for(const enabled of [false,true]){
  let count=0;const f=setup(async()=>{count++;throw failure;});const rpc=currentUserResolver(f.page,()=>true,enabled?{observer:f.observer}:{});f.page.emit('request',wire());let received:any,threw=false;try{await rpc.invoke('getSponsorReport',{planId:'p'});}catch(error){received=error;threw=true;}assert.equal(threw,true);assert.equal(received,failure);assert.equal(count,1);rpc.stop();const result=await f.observer.finish();if(enabled)assert.ok(result.errors.some(e=>e.kind==='external-operation'));
 }
});

test('actual hook optional seam consumes same result and raw HTTP failure without extra fetch',async()=>{
 const originalFetch=globalThis.fetch;
 try{for(const enabled of [false,true])for(const httpStatus of [200,429]){
  let calls=0;const raw=httpStatus===200?'{}':'{"code":"RATE_LIMIT_EXCEEDED","detail":"exact failure"}',saved:any[]=[];const page:any=new EventEmitter();const observer=createReportThroughputObserver({page,extensionId,saveFailure:(id,raw)=>saved.push({id,raw})});
  globalThis.fetch=(async(url:any,options:any)=>{calls++;assert.equal(new URL(url).hostname,'example.invalid');assert.equal(options.headers.Authorization,'Bearer synthetic-private-secret');return new Response(raw,{status:httpStatus});}) as any;
  if(httpStatus===200)assert.deepEqual(await getTestState('lz-ppm',{what:'plan',planId:'p'},enabled?observer:null),{});else await assert.rejects(getTestState('lz-ppm',{what:'plan',planId:'p'},enabled?observer:null),/testState lz-ppm -> 429:.*RATE_LIMIT_EXCEEDED/);
  assert.equal(calls,1);const result=await observer.finish();assert.equal(result.complete,!enabled||httpStatus===200);if(enabled&&httpStatus===429)assert.deepEqual(JSON.parse(saved[0].raw).envelope,JSON.parse(raw));assert.doesNotMatch(JSON.stringify(result),/synthetic-private-secret/);
 }}finally{globalThis.fetch=originalFetch;}
});

test('observer callback exception is isolated from original helper success and recorded',async()=>{
 let faults=0,posts=0;const observer={beginExternal(){throw new Error('observer broke');},recordObserverFailure(){faults++;}};
 const f=setup(async()=>{posts++;return {status:()=>200,json:async()=>({data:{invokeExtension:{response:{body:{success:true}}}}})};});const rpc=currentUserResolver(f.page,()=>true,{observer});f.page.emit('request',wire());assert.deepEqual(await rpc.invoke('getSponsorReport'),{success:true});assert.equal(faults,1);assert.equal(posts,1);rpc.stop();await f.observer.finish();
});
