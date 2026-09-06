# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-large-history.spec.ts >> large history and report: existing >2000 Jira issues retain every captured field, complete HTML and terminal rows without mutating the source
- Location: scenarios/lz-ppm/journey-campaign-large-history.spec.ts:14:1

# Error details

```
AggregateError: Large history body/cleanup failures
```

```
AggregateError: Report capture and cleanup failed; exact owned resources retained
```

```
Error: advanceSponsorReportCapture: [{"message":"There was an error invoking the function - RequestId: 104d2ae4-e25e-4376-8206-df8b7ea4f4a4 Error: Task timed out after 25.00 seconds","extensions":{"__typename":"GenericMutationErrorExtension","errorType":"FUNCTION_TIME_OUT","statusCode":400}}]
```

```
Error: Report capture cleanup is unverified; exact owned resources must be retained.
```

```
Error: Report capture cleanup is unverified; exact owned resources must be retained.
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
  4  | export async function observeCaptureProbe(read,onObserved){const observed=await read();await onObserved(observed);return observed;}
  5  | export function verifyCaptureProbe(probe,{planId,jobId,state,checkpoint,cleanupDone,reportId},before=null){
  6  |  assert.equal(probe.planId,planId);assert.equal(probe.jobId,jobId);assert.equal(probe.registryMember,true);assert.equal(probe.state,state);assert.equal(probe.checkpoint,checkpoint);assert.equal(probe.cleanupDone,cleanupDone);
  7  |  assert.ok(['active','complete','cancelled','failed'].includes(state));
  8  |  const markerHashes=reportId?new Map(['current','baseline'].map(collection=>[createHash('sha256').update(JSON.stringify(`p:${planId}:${collection==='current'?'sponsor-reports':'sponsor-report-baselines'}:deleted:${reportId}`)).digest('hex'),collection])):new Map();
  9  |  for(const family of ['private','public']){const rows=probe[`${family}Artifacts`];assert.ok(Array.isArray(rows));assert.match(probe[`${family}ManifestHash`],/^[a-f0-9]{64}$/);assert.equal(new Set(rows.map(r=>r.keyHash)).size,rows.length);assert.equal(probe[`${family}ManifestHash`],createHash('sha256').update(JSON.stringify(rows.map(r=>r.keyHash))).digest('hex'),'Manifest hash does not cover its full key list');
  10 |   for(const item of rows){assert.match(item.keyHash,/^[a-f0-9]{64}$/);assert.equal(typeof item.present,'boolean');if(family==='private')assert.match(item.expectedHash,/^[a-f0-9]{64}$/);if(item.present)assert.match(item.actualHash,/^[a-f0-9]{64}$/);else assert.equal(item.actualHash,null);if(family==='private'&&item.present)assert.equal(item.actualHash,item.expectedHash);}
  11 |   if(family==='public'){
  12 |    for(const item of rows){
  13 |     assert.ok(['descriptor','chunk','page','deletion-marker'].includes(item.role),'Unknown public artifact role');assert.ok(['current','baseline'].includes(item.collection),'Unknown public artifact collection');
  14 |     const marker=markerHashes.get(item.keyHash);
  15 |     if(item.role==='deletion-marker'){assert.ok(marker,'Deletion marker is not an exact owned report marker');assert.equal(item.collection,marker);}else assert.equal(marker,undefined,'Known deletion marker mislabeled as content');
  16 |     const expected=state==='complete'?item.role!=='deletion-marker':cleanupDone?false:null;assert.equal(item.expectedPresent,expected,'Server role expectation differs from independent terminal rule');
  17 |     if(expected!==null)assert.equal(item.present,expected,'Published content or terminal cleanup left wrong physical key state');
  18 |    }
  19 |    if(rows.length||state==='complete'){assert.ok(reportId,'Public manifest requires exact report identity');assert.deepEqual(rows.filter(r=>r.role==='deletion-marker').map(r=>r.keyHash).sort(),[...markerHashes.keys()].sort(),'Both exact deletion markers must remain in cleanup manifest');}
  20 |   }
  21 |   if(before){assert.equal(probe[`${family}ManifestHash`],before[`${family}ManifestHash`]);assert.deepEqual(rows.map(r=>r.keyHash),before[`${family}Artifacts`].map(r=>r.keyHash));if(family==='private')assert.deepEqual(rows.map(r=>r.expectedHash),before.privateArtifacts.map(r=>r.expectedHash));else assert.deepEqual(rows.map(r=>[r.role,r.collection]),before.publicArtifacts.map(r=>[r.role,r.collection]));}
  22 |   if(cleanupDone&&family==='private')for(const item of rows)assert.equal(item.present,false,'Terminal cleanup left private data present');
  23 |  }
  24 |  return probe;
  25 | }
  26 | /** Real owner RPC cleanup, one acknowledged bounded stage at a time. Never retry an error. */
  27 | export async function cleanReportCapture({planId,requestId,jobId,invoke,probe,onState=(_s)=>{},stopUi=async()=>{},now=()=>Date.now(),maxSteps=2000}){
  28 |  const state={planId,requestId,jobId,steps:[],probes:[],startedAt:now(),cleaned:false};const retain=()=>onState(structuredClone(state));retain();
  29 |  try{
  30 |   await stopUi();const read=await invoke('getSponsorReportCapture',{planId,...(jobId?{jobId}:{})});assert.equal(read.success,true,read.error);const initial=read.job;
  31 |   if(initial===null){assert.equal(jobId,undefined,'Previously acknowledged job disappeared');state.noRegisteredJob=true;state.cleaned=true;retain();return state;}
  32 |   assert.ok(initial && typeof initial==='object' && !Array.isArray(initial),'Discovery must return an explicit job object or null');
  33 |   assert.equal(initial.requestId,requestId,'Cleanup cannot adopt another owner request');if(jobId)assert.equal(initial.id,jobId);state.jobId=initial.id;
  34 |   let job=initial;const first=await observeCaptureProbe(()=>probe(planId,job.id),observed=>{state.probes.push(observed);retain();});verifyCaptureProbe(first,{planId,jobId:job.id,...job});
  35 |   for(let n=0;!job.cleanupDone;n++){
  36 |    assert.ok(n<maxSteps,'Cleanup exceeded bounded acknowledged step count');assert.ok(now()-state.startedAt<600000,'Cleanup exceeded total observation deadline');
  37 |    const result=await invoke('cancelSponsorReportCapture',{planId,jobId:job.id});assert.equal(result.success,true,result.error);const next=result.job;
  38 |    assert.equal(next.id,job.id);assert.equal(next.requestId,requestId);assert.ok(next.checkpoint>job.checkpoint,'Cleanup returned no acknowledged progress');
  39 |    assert.equal(next.state,initial.state==='complete'?'complete':initial.state==='failed'?'failed':'cancelled');state.steps.push({before:job.checkpoint,after:next.checkpoint,state:next.state,cleanupDone:next.cleanupDone});job=next;retain();
  40 |   }
  41 |   for(let n=0;n<2;n++){const observed=await observeCaptureProbe(()=>probe(planId,job.id),value=>{state.probes.push(value);retain();});verifyCaptureProbe(observed,{planId,jobId:job.id,...job},first);}
  42 |   state.cleaned=true;state.job=job;retain();return state;
  43 |  }catch(error){state.error={name:error.name,message:error.message};retain();throw reportRecovery(error,state);}
  44 | }
  45 | 
```