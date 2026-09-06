import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retained} from './seventeenth-report-recovery-contract.mjs';
export const forensicModes=Object.freeze(['context','analyze']);
export function createForensicReader({base,secret,fetchImpl=fetch,onObserved=(_event)=>{},now=Date.now}){
 assert.equal(typeof secret,'string');assert.ok(secret.length>0);const endpoint=new URL(base);assert.equal(endpoint.protocol,'https:');let index=0;
 return async mode=>{
  assert.equal(mode,forensicModes[index],'Only the two fixed modes in exact order, each once');index++;
  const query={what:'reportCaptureForensic',mode,planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:'78'};const encoded=new URLSearchParams(query).toString();assert.ok(Buffer.byteLength(encoded)<=512);const u=new URL(endpoint);for(const[k,v]of Object.entries(query))u.searchParams.set(k,v);
  const startedMs=now();/** @type {any} */const observed={mode,query,method:'GET',requestBodyBytes:0,startedMs,httpStatus:null,body:null,responseBytes:0,raw:null};onObserved({...observed,stage:'before-read'});
  try{
   const res=await fetchImpl(u.toString(),{method:'GET',headers:{Authorization:`Bearer ${secret}`},redirect:'error',signal:AbortSignal.timeout(60000)});observed.httpStatus=res.status;observed.traceId=res.headers.get('atl-traceid');const reader=res.body?.getReader();assert.ok(reader,'Response body is required');const chunks=[];let total=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>65536){await reader.cancel();throw new Error('Forensic response exceeded65536-byte summary bound');}chunks.push(Buffer.from(value));}}finally{observed.responseBytes=total;}
   const bytes=Buffer.concat(chunks);observed.responseSha256=createHash('sha256').update(bytes).digest('hex');observed.raw=bytes.toString('utf8');try{observed.body=JSON.parse(observed.raw);}catch{observed.parseError='Non-JSON forensic response';}
   observed.returnedMs=now();observed.elapsedMs=observed.returnedMs-startedMs;onObserved({...observed,stage:'returned'});return observed;
  }catch(error){observed.returnedMs=now();observed.elapsedMs=observed.returnedMs-startedMs;observed.error={name:error?.name||'Error',message:error?.message||String(error)};onObserved({...observed,stage:'failed'});throw error;}
 };
}
