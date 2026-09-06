import assert from 'node:assert/strict';
import {assertCapacityWireFresh} from './capacity-wire-lifecycle.mjs';
export const capacityWireToken=wire=>wire?.data?.variables?.input?.payload?.contextToken;
export const capacityWireIdentity=wire=>({operationName:wire?.data?.operationName,entryPoint:wire?.data?.variables?.input?.entryPoint,extensionId:wire?.data?.variables?.input?.extensionId,contextIds:wire?.data?.variables?.input?.contextIds});
export const expectedCapacityWire={
 endpoint:'https://wolfaenpak.atlassian.net/gateway/api/graphql/pq/17357ad13472c97d7073c2a1eb4b600d98011b17893ba0a316e9e5de283bfc82?operation=useInvokeExtensionRelayMutation',
 accountId:'712020:937bc860-eec2-4294-a65d-8e0fe7c45086',
 identity:{operationName:'useInvokeExtensionRelayMutation',entryPoint:'resolver',extensionId:'ari:cloud:ecosystem::extension/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77/static/ppm-dashboard',contextIds:['ari:cloud:jira:049de078-bffa-42d1-bbfb-ad8db9860adb:workspace/de27b172-aad3-4897-a5a7-d13252993e62']}
};
// The route calls this inside its returned-budget operation, immediately before actual continuation.
/** @param {any} route @param {any} timing @param {{wire:any,now?:()=>number}} options */
export function guardedCapacityRoute(route,timing,{wire,now=Date.now}){
 return {request:()=>route.request(),continue:()=>{
  assert(wire.url===expectedCapacityWire.endpoint,'Unexpected Forge endpoint');
  assert.deepEqual(capacityWireIdentity(wire),expectedCapacityWire.identity,'Unexpected Forge identity');
  timing.freshness=assertCapacityWireFresh(wire,{tokenOf:capacityWireToken,now:now()});
  timing.dispatchedAtMs=now();
  return route.continue();
 }};
}
// Only terminal evidence from the exact matched request's WeakMap entry is eligible.
export function verifiedAcquisition({wire,accountId,timing}){
 const observed=timing?.observed;
 assert(observed?.state==='finished'&&observed.key==='getCapacitySettings'&&Number.isSafeInteger(observed.requestId)&&observed.requestId>0,'Capacity request did not finish');
 assert.deepEqual(wire?.data?.variables?.input?.payload?.call,{functionKey:'getCapacitySettings',payload:{}},'Unexpected Capacity call');
 assert(observed.httpStatus===200&&observed.outerSuccess===true&&(!observed.errors||Array.isArray(observed.errors)&&observed.errors.length===0),'Capacity response failed');
 assert(observed.responseBytes>0&&observed.responseBytes<=8388608,'Capacity response size invalid');
 for(const key of ['requestedAtMs','dispatchedAtMs','completedAtMs'])assert(Number.isSafeInteger(timing[key])&&timing[key]>=0&&timing[key]===observed[key],'Capacity timing mismatch');
 assert(timing.requestedAtMs<=timing.dispatchedAtMs&&timing.dispatchedAtMs<=timing.completedAtMs,'Capacity timing order');
 return {wire,accountId,httpStatus:observed.httpStatus,outerSuccess:observed.outerSuccess,errors:observed.errors,body:observed.body,requestedAtMs:timing.requestedAtMs,dispatchedAtMs:timing.dispatchedAtMs,completedAtMs:timing.completedAtMs};
}
// A durable dispatch-note failure must not release lifecycle ownership while HTTP is active.
export async function settledRequest(post,onDispatched){
 const pending=post();
 pending.catch(()=>{});
 let noteFailed=false,noteError;
 try{onDispatched();}catch(error){noteFailed=true;noteError=error;}
 let transportFailed=false,transportError,response;
 try{response=await pending;}catch(error){transportFailed=true;transportError=error;}
 if(noteFailed&&transportFailed)throw new AggregateError([noteError,transportError],'Dispatch evidence and actual transport both failed');
 if(noteFailed)throw noteError;
 if(transportFailed)throw transportError;
 return response;
}

import {createHash} from 'node:crypto';
// APIRequestContext errors may embed a request call log containing credentials.
export function safeTransportFailure(error,kind){
 assert(['report-rpc','browser-principal'].includes(kind),'Unknown transport failure kind');
 let text;try{text=String(error);}catch{text='Unstringifiable transport failure';}
 const receipt={errorEncoding:'transport-error-digest-v1',kind,errorSha256:createHash('sha256').update(text).digest('hex'),errorBytes:Buffer.byteLength(text),unknownOutcome:true};
 const safe=Object.assign(new Error(`SAFE_${kind.toUpperCase().replaceAll('-','_')}_FAILED`),{receipt});
 return safe;
}
export async function browserPrincipal(page,base){
 try{const response=await page.request.get(`${base}/rest/api/3/myself`,{maxRetries:0,maxRedirects:0,timeout:60000});const value=await response.json();return {httpStatus:response.status(),accountId:value.accountId};}
 catch(error){throw safeTransportFailure(error,'browser-principal');}
}
