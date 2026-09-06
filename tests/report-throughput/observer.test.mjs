import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {createReportThroughputObserver,observeCall} from '../../scenarios/lz-ppm/report-throughput-observer.mjs';
const extensionId='ari:cloud:ecosystem::extension/app/env/static/ppm-dashboard';
const outer=body=>JSON.stringify({data:{invokeExtension:{success:true,response:{body}}}});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(options={}){let t=0;const page=new EventEmitter(),events=[],raws=[];const observer=createReportThroughputObserver({page,extensionId,now:()=>t,wall:()=>1000+t,emit:e=>events.push(structuredClone(e)),saveFailure:(id,raw)=>raws.push({id,raw}),...options});return {page,events,raws,observer,tick:v=>{t=v;}};}
function req(key='advanceSponsorReportCapture',id=extensionId){return {url:()=> 'https://example.invalid/gateway/api/graphql',postDataBuffer:()=>Buffer.from(JSON.stringify({variables:{input:{extensionId:id,payload:{contextToken:'never-retain-token',context:{secret:'never-retain-context'},call:{functionKey:key,payload:{planId:'p',jobId:'j',expectedCheckpoint:1}}}}}})),timing:()=>({startTime:1000,requestStart:1,responseStart:4,responseEnd:8}),failure:()=>({errorText:'synthetic connection reset'})};}
function response(r,text=outer({success:true}),status=200){return {request:()=>r,status:()=>status,text:async()=>text};}
function dispatch(f,r){f.page.emit('request',r);}
function complete(f,r,res=response(r)){f.page.emit('response',res);f.page.emit('requestfinished',r);}

test('held body never serializes later dispatch/header/terminal timestamps',async()=>{
 const f=fixture(),a=req(),b=req('presenceBeat'),hold=deferred();f.tick(10);dispatch(f,a);f.tick(20);f.page.emit('response',{...response(a),text:()=>hold.promise});
 f.tick(21);dispatch(f,b);f.tick(22);complete(f,b);await Promise.resolve();f.tick(30);f.page.emit('requestfinished',a);f.tick(40);hold.resolve(outer({success:true,job:{checkpoint:2,forecastRuns:{completed:1,total:40}}}));
 const result=await f.observer.finish();assert.equal(result.complete,true);assert.equal(result.records[0].events[1].at.monoMs,20);assert.equal(result.records[1].start.monoMs,21);assert.equal(result.records[1].bodyTerminal.monoMs,22);assert.equal(result.records[0].bodyTerminal.monoMs,40);assert.equal(result.records[0].networkTerminal.monoMs,30);
 assert.equal(result.records[0].events.find(e=>e.type==='network-finished').timing.responseEnd,8);
 assert.doesNotMatch(JSON.stringify(result),/never-retain-token|never-retain-context/);
});
test('all exact-app keys including no-plan reads are observed; foreign extension excluded',async()=>{
 const f=fixture();for(const k of ['presenceBeat','getNotifications','getCapacitySettings','newUnknownFutureRpc']){const r=req(k);dispatch(f,r);complete(f,r);}const other=req('captureSponsorReport',extensionId.replace('/app/','/foreign/'));dispatch(f,other);complete(f,other);
 const result=await f.observer.finish();assert.equal(result.complete,true);assert.deepEqual(result.records.map(r=>r.key),['presenceBeat','getNotifications','getCapacitySettings','newUnknownFutureRpc']);
});
test('HTTP, outer and body refusals retain exact raw/hash and phase without interrupting other calls',async()=>{
 const f=fixture();f.observer.mark('capture');const replies=[['getNotifications','{"rate":"RATE_LIMIT_EXCEEDED"}',429],['advanceSponsorReportCapture',JSON.stringify({data:{invokeExtension:{success:false,errors:[{message:'expired'}]}}}),200],['presenceBeat',outer({success:false,error:'refused'}),200]];
 for(const[k,raw,status]of replies){const r=req(k);dispatch(f,r);complete(f,r,response(r,raw,status));}
 f.observer.mark('post-capture-audit');const r=req('getSponsorReport');dispatch(f,r);complete(f,r);const result=await f.observer.finish();assert.equal(result.complete,false);assert.equal(result.records[3].outcome,'success');assert.equal(f.raws.length,3);
 for(let n=0;n<3;n++){assert.deepEqual(JSON.parse(f.raws[n].raw).envelope,JSON.parse(replies[n][1]));assert.equal(JSON.parse(f.raws[n].raw).originalRawRetained,false);assert.equal(result.records[n].phaseAtStart,'capture');assert.equal(result.records[n].events.find(e=>e.type==='body-terminal').responseSha256,createHash('sha256').update(replies[n][1]).digest('hex'));}
});
test('malformed JSON, body rejection and requestfailed remain distinct failures',async()=>{
 const f=fixture(),a=req(),b=req(),c=req();dispatch(f,a);complete(f,a,response(a,'not json'));dispatch(f,b);complete(f,b,{...response(b),text:async()=>{throw new Error('body unavailable');}});dispatch(f,c);f.page.emit('requestfailed',c);
 const result=await f.observer.finish();assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.kind==='response'));assert.ok(result.errors.some(e=>e.kind==='body'));assert.ok(result.errors.some(e=>e.kind==='transport'));assert.equal(JSON.parse(f.raws[0].raw).format,'unparseable');assert.equal(JSON.parse(f.raws[0].raw).contentOmitted,true);assert.equal(JSON.parse(f.raws[0].raw).originalSha256,createHash('sha256').update('not json').digest('hex'));
});
test('finish retains unresolved work and detaches; it never claims timeout completion',async()=>{
 const f=fixture(),r=req(),hold=deferred();dispatch(f,r);f.page.emit('response',{...response(r),text:()=>hold.promise});const result=await f.observer.finish({timeoutMs:5});assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.kind==='incomplete'));for(const event of ['request','response','requestfinished','requestfailed'])assert.equal(f.page.listenerCount(event),0);hold.resolve(outer({success:true}));
});
test('throwing/rejected/terminal sinks fail final grade but cannot block dispatch or replace falsy errors',async()=>{
 for(const emit of [()=>{throw new Error('disk');},()=>Promise.reject(new Error('disk')),e=>e.type==='observer-terminal'?Promise.reject(new Error('terminal disk')):undefined]){
  const f=fixture({emit});const r=req();assert.doesNotThrow(()=>dispatch(f,r));complete(f,r);const result=await f.observer.finish();assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.kind==='observer'));
 }
 const f=fixture();const id=observeCall(f.observer,'beginExternal','rpc','getSponsorReport',{});observeCall(f.observer,'endExternal',id,0,true);const result=await f.observer.finish();assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.message==='0'));
});
test('nonmonotonic clocks and malformed same-app calls cannot silently disappear',async()=>{
 const f=fixture();f.tick(2);dispatch(f,req());f.tick(1);dispatch(f,req());const malformed=req();malformed.postDataBuffer=()=>Buffer.from(JSON.stringify({variables:{input:{extensionId,payload:{call:null}}}}));dispatch(f,malformed);const result=await f.observer.finish();assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.kind==='unclassified-app-rpc'));assert.ok(result.errors.some(e=>e.message.includes('clock')));
});
test('hook clone and API body are independent observed terminal surfaces, never extra transports',async()=>{
 const f=fixture();f.observer.mark('preparation');const hook=f.observer.beginExternal('hook','plan',{planId:'p'});f.observer.externalResponse(hook,new Response('{"success":true,"issues":[]}',{status:200}));f.observer.endExternal(hook);
 f.observer.mark('direct-page-audit');const rpc=f.observer.beginExternal('rpc','getSponsorReportPage',{planId:'p'});f.observer.externalResponse(rpc,response(null,outer({success:true,page:{rows:[]}})));f.observer.endExternal(rpc);
 const result=await f.observer.finish();assert.equal(result.complete,true);assert.deepEqual(result.records.map(r=>r.kind),['hook','rpc']);assert.equal(result.records[0].events[1].type,'response-headers-observed');assert.equal(result.records[1].events[1].type,'api-response-available');assert.equal(result.records[1].events[2].type,'external-consumer-terminal');
});

test('wrong app filter or only direct audit success cannot pass large capture coverage',async()=>{
 const f=fixture();const r=req('captureSponsorReport',extensionId.replace('/app/','/other/'));dispatch(f,r);complete(f,r);const result=await f.observer.finish({requireCapture:true});assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.kind==='capture-coverage'));
 const good=fixture();for(const [key,job] of [['captureSponsorReport',{state:'active',cleanupDone:false}],['advanceSponsorReportCapture',{state:'complete',cleanupDone:false}],['cancelSponsorReportCapture',{state:'complete',cleanupDone:true}]]){const q=req(key);dispatch(good,q);complete(good,q,response(q,outer({success:true,job})));}assert.equal((await good.observer.finish({requireCapture:true})).complete,true);
});

test('real-shaped outer-success/body-failure cannot persist response credentials or echoed header values',async()=>{
 const f=fixture(),r=req();const raw=JSON.stringify({data:{invokeExtension:{success:true,contextToken:'renewed-secret-token',response:{headers:{Authorization:'Bearer echoed-secret',other:'sensitive-header'},body:{success:false,error:'refused renewed-secret-token and Bearer echoed-secret',contextToken:'nested-secret'}}}}});
 dispatch(f,r);complete(f,r,response(r,raw));const result=await f.observer.finish();assert.equal(result.complete,false);
 const evidence=JSON.parse(f.raws[0].raw);assert.equal(evidence.originalSha256,createHash('sha256').update(raw).digest('hex'));assert.equal(evidence.originalBytes,Buffer.byteLength(raw));assert.equal(evidence.originalRawRetained,false);assert.equal(evidence.removedFields.length,3);assert.equal(evidence.envelope.data.invokeExtension.response.body.success,false);
 assert.doesNotMatch(f.raws[0].raw,/renewed-secret-token|Bearer echoed-secret|sensitive-header|nested-secret/);assert.doesNotMatch(JSON.stringify(result),/renewed-secret-token|Bearer echoed-secret|sensitive-header|nested-secret/);
 assert.equal(result.records[0].events.find(e=>e.type==='body-terminal').responseSha256,evidence.originalSha256);
});
test('nonarray outer/top-level errors are failures even when success and body are true',async()=>{
 for(const placement of ['outer','top']){const f=fixture(),r=req();const value=JSON.parse(outer({success:true}));if(placement==='outer')value.data.invokeExtension.errors={message:'RATE_LIMIT_EXCEEDED'};else value.errors={message:'RATE_LIMIT_EXCEEDED'};dispatch(f,r);complete(f,r,response(r,JSON.stringify(value)));const result=await f.observer.finish();assert.equal(result.complete,false);assert.equal(f.raws.length,1);assert.ok(result.errors.some(e=>e.kind==='response'));}
});

test('actual persisted-query URL observes exact-extension capture and background traffic',async()=>{
 const endpoint='https://wolfaenpak.atlassian.net/gateway/api/graphql/pq/17357ad13472c97d7073c2a1eb4b600d98011b17893ba0a316e9e5de283bfc82?operation=useInvokeExtensionRelayMutation';
 const f=fixture();for(const key of ['captureSponsorReport','advanceSponsorReportCapture','presenceBeat','getNotifications']){const r=req(key);r.url=()=>endpoint;dispatch(f,r);complete(f,r);}
 for(const url of [endpoint.replace('/graphql/pq/','/other/pq/'),endpoint.replace('17357ad13472c97d7073c2a1eb4b600d98011b17893ba0a316e9e5de283bfc82','bad'),endpoint.replace('/graphql/pq/','/graphql-extra/pq/')]){const r=req();r.url=()=>url;dispatch(f,r);complete(f,r);}
 const foreign=req('presenceBeat',extensionId.replace('/app/','/foreign/'));foreign.url=()=>endpoint;dispatch(f,foreign);complete(f,foreign);
 const result=await f.observer.finish();assert.equal(result.complete,true);assert.deepEqual(result.records.map(r=>r.key),['captureSponsorReport','advanceSponsorReportCapture','presenceBeat','getNotifications']);
});
