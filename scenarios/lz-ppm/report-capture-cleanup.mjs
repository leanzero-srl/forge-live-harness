import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function reportRecovery(error,state){const result=new Error('Report capture cleanup is unverified; exact owned resources must be retained.',{cause:error});result.code='LZ_REPORT_CAPTURE_RECOVERY_REQUIRED';result.reportState=state;return result;}
export function verifyCaptureProbe(probe,{planId,jobId,state,checkpoint,cleanupDone},before=null){
 assert.equal(probe.planId,planId);assert.equal(probe.jobId,jobId);assert.equal(probe.registryMember,true);assert.equal(probe.state,state);assert.equal(probe.checkpoint,checkpoint);assert.equal(probe.cleanupDone,cleanupDone);
 for(const family of ['private','public']){const rows=probe[`${family}Artifacts`];assert.ok(Array.isArray(rows));assert.match(probe[`${family}ManifestHash`],/^[a-f0-9]{64}$/);assert.equal(new Set(rows.map(r=>r.keyHash)).size,rows.length);assert.equal(probe[`${family}ManifestHash`],createHash('sha256').update(JSON.stringify(rows.map(r=>r.keyHash))).digest('hex'),'Manifest hash does not cover its full key list');
  for(const item of rows){assert.match(item.keyHash,/^[a-f0-9]{64}$/);assert.equal(typeof item.present,'boolean');if(family==='private')assert.match(item.expectedHash,/^[a-f0-9]{64}$/);if(item.present)assert.match(item.actualHash,/^[a-f0-9]{64}$/);else assert.equal(item.actualHash,null);if(family==='private'&&item.present)assert.equal(item.actualHash,item.expectedHash);}
  if(before){assert.equal(probe[`${family}ManifestHash`],before[`${family}ManifestHash`]);assert.deepEqual(rows.map(r=>r.keyHash),before[`${family}Artifacts`].map(r=>r.keyHash));if(family==='private')assert.deepEqual(rows.map(r=>r.expectedHash),before.privateArtifacts.map(r=>r.expectedHash));}
  if(cleanupDone)for(const item of rows)assert.equal(item.present,family==='public'&&state==='complete','Terminal cleanup left wrong physical key state');
 }
 return probe;
}
/** Real owner RPC cleanup, one acknowledged bounded stage at a time. Never retry an error. */
export async function cleanReportCapture({planId,requestId,jobId,invoke,probe,onState=(_s)=>{},stopUi=async()=>{},now=()=>Date.now(),maxSteps=2000}){
 const state={planId,requestId,jobId,steps:[],probes:[],startedAt:now(),cleaned:false};const retain=()=>onState(structuredClone(state));retain();
 try{
  await stopUi();const read=await invoke('getSponsorReportCapture',{planId,...(jobId?{jobId}:{})});assert.equal(read.success,true,read.error);const initial=read.job;
  if(initial===null){assert.equal(jobId,undefined,'Previously acknowledged job disappeared');state.noRegisteredJob=true;state.cleaned=true;retain();return state;}
  assert.ok(initial && typeof initial==='object' && !Array.isArray(initial),'Discovery must return an explicit job object or null');
  assert.equal(initial.requestId,requestId,'Cleanup cannot adopt another owner request');if(jobId)assert.equal(initial.id,jobId);state.jobId=initial.id;
  let job=initial;const first=await probe(planId,job.id);verifyCaptureProbe(first,{planId,jobId:job.id,...job});state.probes.push(first);retain();
  for(let n=0;!job.cleanupDone;n++){
   assert.ok(n<maxSteps,'Cleanup exceeded bounded acknowledged step count');assert.ok(now()-state.startedAt<600000,'Cleanup exceeded total observation deadline');
   const result=await invoke('cancelSponsorReportCapture',{planId,jobId:job.id});assert.equal(result.success,true,result.error);const next=result.job;
   assert.equal(next.id,job.id);assert.equal(next.requestId,requestId);assert.ok(next.checkpoint>job.checkpoint,'Cleanup returned no acknowledged progress');
   assert.equal(next.state,initial.state==='complete'?'complete':initial.state==='failed'?'failed':'cancelled');state.steps.push({before:job.checkpoint,after:next.checkpoint,state:next.state,cleanupDone:next.cleanupDone});job=next;retain();
  }
  for(let n=0;n<2;n++){const observed=await probe(planId,job.id);verifyCaptureProbe(observed,{planId,jobId:job.id,...job},first);state.probes.push(observed);retain();}
  state.cleaned=true;state.job=job;retain();return state;
 }catch(error){state.error={name:error.name,message:error.message};retain();throw reportRecovery(error,state);}
}
