import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function reportRecovery(error,state){const result=new Error('Report capture cleanup is unverified; exact owned resources must be retained.',{cause:error});result.code='LZ_REPORT_CAPTURE_RECOVERY_REQUIRED';result.reportState=state;return result;}
export async function observeCaptureProbe(read,onObserved){const observed=await read();await onObserved(observed);return observed;}
export function verifyCaptureProbe(probe,{planId,jobId,state,checkpoint,cleanupDone,reportId},before=null){
 assert.equal(probe.planId,planId);assert.equal(probe.jobId,jobId);assert.equal(probe.registryMember,true);assert.equal(probe.state,state);assert.equal(probe.checkpoint,checkpoint);assert.equal(probe.cleanupDone,cleanupDone);
 assert.ok(['active','complete','cancelled','failed'].includes(state));
 const markerHashes=reportId?new Map(['current','baseline'].map(collection=>[createHash('sha256').update(JSON.stringify(`p:${planId}:${collection==='current'?'sponsor-reports':'sponsor-report-baselines'}:deleted:${reportId}`)).digest('hex'),collection])):new Map();
 for(const family of ['private','public']){const rows=probe[`${family}Artifacts`];assert.ok(Array.isArray(rows));assert.match(probe[`${family}ManifestHash`],/^[a-f0-9]{64}$/);assert.equal(new Set(rows.map(r=>r.keyHash)).size,rows.length);assert.equal(probe[`${family}ManifestHash`],createHash('sha256').update(JSON.stringify(rows.map(r=>r.keyHash))).digest('hex'),'Manifest hash does not cover its full key list');
  for(const item of rows){assert.match(item.keyHash,/^[a-f0-9]{64}$/);assert.equal(typeof item.present,'boolean');if(family==='private')assert.match(item.expectedHash,/^[a-f0-9]{64}$/);if(item.present)assert.match(item.actualHash,/^[a-f0-9]{64}$/);else assert.equal(item.actualHash,null);if(family==='private'&&item.present)assert.equal(item.actualHash,item.expectedHash);}
  if(family==='public'){
   for(const item of rows){
    assert.ok(['descriptor','chunk','page','deletion-marker'].includes(item.role),'Unknown public artifact role');assert.ok(['current','baseline'].includes(item.collection),'Unknown public artifact collection');
    const marker=markerHashes.get(item.keyHash);
    if(item.role==='deletion-marker'){assert.ok(marker,'Deletion marker is not an exact owned report marker');assert.equal(item.collection,marker);}else assert.equal(marker,undefined,'Known deletion marker mislabeled as content');
    const expected=state==='complete'?item.role!=='deletion-marker':cleanupDone?false:null;assert.equal(item.expectedPresent,expected,'Server role expectation differs from independent terminal rule');
    if(expected!==null)assert.equal(item.present,expected,'Published content or terminal cleanup left wrong physical key state');
   }
   if(rows.length||state==='complete'){assert.ok(reportId,'Public manifest requires exact report identity');assert.deepEqual(rows.filter(r=>r.role==='deletion-marker').map(r=>r.keyHash).sort(),[...markerHashes.keys()].sort(),'Both exact deletion markers must remain in cleanup manifest');}
  }
  if(before){assert.equal(probe[`${family}ManifestHash`],before[`${family}ManifestHash`]);assert.deepEqual(rows.map(r=>r.keyHash),before[`${family}Artifacts`].map(r=>r.keyHash));if(family==='private')assert.deepEqual(rows.map(r=>r.expectedHash),before.privateArtifacts.map(r=>r.expectedHash));else assert.deepEqual(rows.map(r=>[r.role,r.collection]),before.publicArtifacts.map(r=>[r.role,r.collection]));}
  if(cleanupDone&&family==='private')for(const item of rows)assert.equal(item.present,false,'Terminal cleanup left private data present');
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
  let job=initial;const first=await observeCaptureProbe(()=>probe(planId,job.id),observed=>{state.probes.push(observed);retain();});verifyCaptureProbe(first,{planId,jobId:job.id,...job});
  for(let n=0;!job.cleanupDone;n++){
   assert.ok(n<maxSteps,'Cleanup exceeded bounded acknowledged step count');assert.ok(now()-state.startedAt<600000,'Cleanup exceeded total observation deadline');
   const result=await invoke('cancelSponsorReportCapture',{planId,jobId:job.id});assert.equal(result.success,true,result.error);const next=result.job;
   assert.equal(next.id,job.id);assert.equal(next.requestId,requestId);assert.ok(next.checkpoint>job.checkpoint,'Cleanup returned no acknowledged progress');
   assert.equal(next.state,initial.state==='complete'?'complete':initial.state==='failed'?'failed':'cancelled');state.steps.push({before:job.checkpoint,after:next.checkpoint,state:next.state,cleanupDone:next.cleanupDone});job=next;retain();
  }
  for(let n=0;n<2;n++){const observed=await observeCaptureProbe(()=>probe(planId,job.id),value=>{state.probes.push(value);retain();});verifyCaptureProbe(observed,{planId,jobId:job.id,...job},first);}
  state.cleaned=true;state.job=job;retain();return state;
 }catch(error){state.error={name:error.name,message:error.message};retain();throw reportRecovery(error,state);}
}
