# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report-jobs.spec.ts >> report jobs: paused source checkpoint survives reload and final publication pause, then full retained HTML
- Location: scenarios/lz-ppm/journey-campaign-report-jobs.spec.ts:13:32

# Error details

```
AggregateError: Report capture recovery required; exact owned fixtures retained, cleanup not passed
```

```
AggregateError: Report job body/cleanup failure; exact recovery state retained
```

```
AssertionError: Terminal cleanup left wrong physical key state

false !== true

```

```
Error: Report capture cleanup is unverified; exact owned resources must be retained.
```

# Test source

```ts
  1  | import assert from 'node:assert/strict';
  2  | import {createHash} from 'node:crypto';
> 3  | export function reportRecovery(error,state){const result=new Error('Report capture cleanup is unverified; exact owned resources must be retained.',{cause:error});result.code='LZ_REPORT_CAPTURE_RECOVERY_REQUIRED';result.reportState=state;return result;}
     |                                                          ^ Error: Report capture cleanup is unverified; exact owned resources must be retained.
  4  | export function verifyCaptureProbe(probe,{planId,jobId,state,checkpoint,cleanupDone},before=null){
  5  |  assert.equal(probe.planId,planId);assert.equal(probe.jobId,jobId);assert.equal(probe.registryMember,true);assert.equal(probe.state,state);assert.equal(probe.checkpoint,checkpoint);assert.equal(probe.cleanupDone,cleanupDone);
  6  |  for(const family of ['private','public']){const rows=probe[`${family}Artifacts`];assert.ok(Array.isArray(rows));assert.match(probe[`${family}ManifestHash`],/^[a-f0-9]{64}$/);assert.equal(new Set(rows.map(r=>r.keyHash)).size,rows.length);assert.equal(probe[`${family}ManifestHash`],createHash('sha256').update(JSON.stringify(rows.map(r=>r.keyHash))).digest('hex'),'Manifest hash does not cover its full key list');
  7  |   for(const item of rows){assert.match(item.keyHash,/^[a-f0-9]{64}$/);assert.equal(typeof item.present,'boolean');if(family==='private')assert.match(item.expectedHash,/^[a-f0-9]{64}$/);if(item.present)assert.match(item.actualHash,/^[a-f0-9]{64}$/);else assert.equal(item.actualHash,null);if(family==='private'&&item.present)assert.equal(item.actualHash,item.expectedHash);}
  8  |   if(before){assert.equal(probe[`${family}ManifestHash`],before[`${family}ManifestHash`]);assert.deepEqual(rows.map(r=>r.keyHash),before[`${family}Artifacts`].map(r=>r.keyHash));if(family==='private')assert.deepEqual(rows.map(r=>r.expectedHash),before.privateArtifacts.map(r=>r.expectedHash));}
  9  |   if(cleanupDone)for(const item of rows)assert.equal(item.present,family==='public'&&state==='complete','Terminal cleanup left wrong physical key state');
  10 |  }
  11 |  return probe;
  12 | }
  13 | /** Real owner RPC cleanup, one acknowledged bounded stage at a time. Never retry an error. */
  14 | export async function cleanReportCapture({planId,requestId,jobId,invoke,probe,onState=(_s)=>{},stopUi=async()=>{},now=()=>Date.now(),maxSteps=2000}){
  15 |  const state={planId,requestId,jobId,steps:[],probes:[],startedAt:now(),cleaned:false};const retain=()=>onState(structuredClone(state));retain();
  16 |  try{
  17 |   await stopUi();const read=await invoke('getSponsorReportCapture',{planId,...(jobId?{jobId}:{})});assert.equal(read.success,true,read.error);const initial=read.job;
  18 |   if(initial===null){assert.equal(jobId,undefined,'Previously acknowledged job disappeared');state.noRegisteredJob=true;state.cleaned=true;retain();return state;}
  19 |   assert.ok(initial && typeof initial==='object' && !Array.isArray(initial),'Discovery must return an explicit job object or null');
  20 |   assert.equal(initial.requestId,requestId,'Cleanup cannot adopt another owner request');if(jobId)assert.equal(initial.id,jobId);state.jobId=initial.id;
  21 |   let job=initial;const first=await probe(planId,job.id);verifyCaptureProbe(first,{planId,jobId:job.id,...job});state.probes.push(first);retain();
  22 |   for(let n=0;!job.cleanupDone;n++){
  23 |    assert.ok(n<maxSteps,'Cleanup exceeded bounded acknowledged step count');assert.ok(now()-state.startedAt<600000,'Cleanup exceeded total observation deadline');
  24 |    const result=await invoke('cancelSponsorReportCapture',{planId,jobId:job.id});assert.equal(result.success,true,result.error);const next=result.job;
  25 |    assert.equal(next.id,job.id);assert.equal(next.requestId,requestId);assert.ok(next.checkpoint>job.checkpoint,'Cleanup returned no acknowledged progress');
  26 |    assert.equal(next.state,initial.state==='complete'?'complete':initial.state==='failed'?'failed':'cancelled');state.steps.push({before:job.checkpoint,after:next.checkpoint,state:next.state,cleanupDone:next.cleanupDone});job=next;retain();
  27 |   }
  28 |   for(let n=0;n<2;n++){const observed=await probe(planId,job.id);verifyCaptureProbe(observed,{planId,jobId:job.id,...job},first);state.probes.push(observed);retain();}
  29 |   state.cleaned=true;state.job=job;retain();return state;
  30 |  }catch(error){state.error={name:error.name,message:error.message};retain();throw reportRecovery(error,state);}
  31 | }
  32 | 
```