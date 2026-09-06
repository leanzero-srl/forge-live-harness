# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-private-retained-continuation.spec.ts >> retained private report: exact failed-run owner reopen export and guarded cleanup without recapture
- Location: scenarios/lz-ppm/campaign-private-retained-continuation.spec.ts:18:1

# Error details

```
AggregateError: Private witness audits failed; owned ledger retained
```

```
Error: Private witness operation failed; original detail withheld
```

# Test source

```ts
  1  | import assert from 'node:assert/strict';
  2  | import {createHash} from 'node:crypto';
  3  | import {legacyForecastInput} from './report-legacy-upgrade-contract.mjs';
  4  | import {prepareSponsorReport,reportForecast,reportIssueRows,reportSummary,sponsorReportHtml} from '../../tests/seventeenth-forecast-resume/old-producer-frozen.mjs';
  5  | const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  6  | export const privateHash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
  7  | export const privateAccount='712020:937bc860-eec2-4294-a65d-8e0fe7c45086';
  8  | export function admitPrivatePhase(value){if(value===undefined||value==='')return false;assert.equal(value,'owner');return true;}
  9  | const instant=x=>{assert.equal(typeof x,'string');assert(Number.isFinite(Date.parse(x)));};
  10 | export function admitPrivateSource(source,name){
  11 |  const m=source?.meta;assert.match(m?.id||'',/^plan-test-[a-z0-9-]+$/);assert.equal(m.name,name);assert(name.startsWith('[harness-test]'));assert.equal(m.createdBy,'harness');assert.equal(m.mode,undefined);assert.equal(m.status,'indexed');assert.equal(m.issueCount,1);assert.deepEqual(m.sources,[{id:'src-0',type:'jql',label:'harness',query:'key = WFH-2820',boardId:null,projectKey:null}]);assert.equal(source.issues.length,1);assert.equal(String(source.issues[0].id),'25020');assert.equal(source.issues[0].key,'WFH-2820');return {planId:m.id,name:m.name,kind:'source'};
  12 | }
  13 | export function verifyPrivateSnapshot(snapshot,source,calendar,name){
  14 |  assert.equal(snapshot.assetsReadState,'requires-current-user-read');
  15 |  const expected=legacyForecastInput(source,calendar);assert.deepEqual(snapshot.issues,expected.input.issues);assert.deepEqual(snapshot.calendar,calendar);assert.deepEqual(snapshot.milestones,[]);assert.deepEqual(snapshot.sources,source.meta.sources);assert.equal(snapshot.name,name);assert.equal(snapshot.kind,'scenario');assert.equal(snapshot.uncertainty,'medium');assert.equal(snapshot.sourceVersion,source.meta.version);assert.equal(snapshot.createdBy,privateAccount);assert.equal(snapshot.planId,source.meta.id);assert.equal(snapshot.mode,undefined);assert.equal(snapshot.workingChangeCount,0);assert.equal(snapshot.state,'complete');assert.equal(snapshot.schemaVersion,1);assert.equal(snapshot.issueCount,1);assert.equal(snapshot.chunkCount,1);assert.deepEqual(snapshot.chunkHashes,[privateHash(snapshot.issues)]);instant(snapshot.takenAt);
  16 |  assert.deepEqual(snapshot.consistency,{method:'two-matching-reads',basisHash:privateHash({meta:source.meta,issues:source.issues,calendar,deps:{}}),observedAt:snapshot.consistency.observedAt});instant(snapshot.consistency.observedAt);
  17 |  const {assetsReadState,id,planId,schemaVersion,issueCount,chunkCount,chunkHashes,hash,state,issues,...details}=snapshot;assert.match(id,/^[a-zA-Z0-9_-]{1,100}$/);assert.equal(hash,privateHash({details,issues}));return expected;
  18 | }
  19 | export function admitPrivateForkIdentity({ack,source,snapshot,name}){
  20 |  assert.equal(ack?.success,true);const p=ack.plan;assert.match(p?.id||'',/^sim-[0-9a-f-]{36}$/);assert.equal(p.name,name);assert.equal(p.createdBy,privateAccount);assert.equal(p.mode,'simulation');assert.deepEqual(p.sources,[]);assert.deepEqual(p.members,[]);assert.equal(p.defaultAccess,'none');assert.equal(p.protectionEnabled,false);assert.equal(p.includeParents,false);assert.equal(p.issueCount,1);assert.equal(p.version,1);assert.equal(p.status,'indexed');assert.equal(p.simulationDeleted,undefined);assert.equal(p.simulationGeneration,p.simulationScopeBasis);assert.match(p.simulationGeneration,/^[a-zA-Z0-9_-]{1,100}$/);
  21 |  assert.deepEqual(p.simulationProvenance,{sourcePlanId:source.meta.id,snapshotId:snapshot.id,snapshotHash:snapshot.hash,snapshotTakenAt:snapshot.takenAt,sources:source.meta.sources,createdAt:p.simulationProvenance.createdAt});instant(p.simulationProvenance.createdAt);
  22 |  return p;
  23 | }
  24 | export function admitPrivateFork({ack,source,snapshot,name,planRead,modelRead}){
  25 |  const p=admitPrivateForkIdentity({ack,source,snapshot,name});
  26 |  assert.deepEqual(planRead,{success:true,plan:p});assert.equal(modelRead.success,true);assert.equal(modelRead.version,p.version);assert.deepEqual(modelRead.model,modelRead.scopeBasis);
  27 |  const m=modelRead.model;assert.equal(m.id,p.simulationGeneration);assert.equal(m.planId,p.id);assert.equal(m.state,'complete');assert.equal(m.createdBy,privateAccount);assert.equal(m.mode,'simulation');assert.equal(m.name,name);assert.equal(m.assetsReadState,'requires-current-user-read');assert.deepEqual(m.sources,[]);assert.deepEqual(m.calendar,snapshot.calendar);assert.deepEqual(m.milestones,snapshot.milestones);assert.equal(m.uncertainty,'medium');assert.deepEqual(m.issues,snapshot.issues.map(i=>({...i,capturedDuration:true})));assert(m.issues.every(i=>!Object.hasOwn(i,'assets')),'This witness requires the unconfigured source Assets shape');
  28 |  const {assetsReadState,id,planId,schemaVersion,issueCount,chunkCount,chunkHashes,hash,state,issues,...details}=m;assert.equal(schemaVersion,1);assert.equal(issueCount,1);assert.equal(chunkCount,1);assert.deepEqual(chunkHashes,[privateHash(issues)]);assert.equal(hash,privateHash({details,issues}));
  29 |  return {planId:p.id,name:p.name,kind:'private',plan:structuredClone(p),modelRead:structuredClone(modelRead)};
  30 | }
  31 | export function privateReportOracle({owner,job,summary,name,captureWindow}){
  32 |  const {plan:p,modelRead:{model}}=owner;assert.equal(job.state,'complete');assert.equal(job.cleanupDone,true);assert.equal(job.reportId,summary.id);assert.equal(job.name,name);assert.equal(job.forecastRuns.completed,300);assert.equal(job.forecastRuns.total,300);
  33 |  const captured={mode:'simulation',issues:model.issues,calendar:model.calendar,milestones:model.milestones,uncertainty:'medium'};
  34 |  const forecast=reportForecast(captured).forecast;assert.equal(forecast.runs,300);assert.equal(forecast.p50,'2026-10-09');assert.equal(forecast.p80,'2026-10-12');assert.equal(forecast.p90,'2026-10-12');assert.equal(forecast.onPlannedFinish,197/300);
  35 |  const {assetsReadState,...rawModel}=model;
  36 |  const consistency={method:'two-matching-reads',basisHash:privateHash({meta:p,issues:rawModel.issues,calendar:model.calendar,deps:{}}),observedAt:summary.consistency.observedAt,verifiedAfterAnalysisAt:summary.consistency.verifiedAfterAnalysisAt};instant(consistency.observedAt);instant(consistency.verifiedAfterAnalysisAt);assert(Date.parse(consistency.observedAt)<=Date.parse(consistency.verifiedAfterAnalysisAt));instant(summary.takenAt);assert(Date.parse(summary.takenAt)>=captureWindow.startMs&&Date.parse(summary.takenAt)<=captureWindow.endMs);
  37 |  const rows=reportIssueRows(captured),input={mode:'simulation',name,planName:p.name,sourceVersion:p.version,calendar:model.calendar,uncertainty:'medium',workingChangeCount:0,targets:[],forecast,id:job.reportId,takenAt:summary.takenAt,createdBy:privateAccount,issues:rows,baseline:null,consistency,capacity:{state:'not-included',scope:'captured-plan',reason:'Capacity was not included at capture. No availability is assumed.'},sections:{timeline:rows,targets:[],changes:[]}};
  38 |  const prepared=prepareSponsorReport(p.id,input),expected=reportSummary({...prepared.current.descriptor,state:'complete',issues:rows},null);assert.deepEqual(summary,expected);
  39 |  const pages=prepared.pages.map(({key,rows})=>{const [,section,n]=key.match(/:page:[^:]+:([^:]+):(\d+)$/);return{reportId:expected.id,hash:expected.hash,section,page:Number(n),pageCount:expected.pages[section],total:expected.counts[section],pageHash:privateHash(rows),rows};});
  40 |  return {summary:expected,pages,html:sponsorReportHtml(expected,pages),forecastInputHash:forecast.inputHash};
  41 | }
  42 | function cancelledSuccessor(previous,next){
  43 |  assert.equal(next?.state,'cancelled');for(const key of ['id','requestId','reportId','name','createdAt','expiresAt'])assert.equal(next[key],previous[key]);assert(Number.isSafeInteger(previous.checkpoint));assert(Number.isSafeInteger(next.checkpoint));assert.equal(next.checkpoint,previous.checkpoint+1);assert.equal(typeof next.cleanupDone,'boolean');return next;
  44 | }
  45 | export function privateDeletedState(previous,next){
  46 |  assert.equal(previous.state,'complete');assert.equal(previous.cleanupDone,true);cancelledSuccessor(previous,next);assert.equal(next.cleanupDone,false);return next;
  47 | }
  48 | export function privateCleanupStep(previous,next){
  49 |  assert.equal(previous.state,'cancelled');assert.equal(previous.cleanupDone,false);return cancelledSuccessor(previous,next);
  50 | }
> 51 | export function safePrivateError(error){const detail=String(error?.message??error);return Object.assign(new Error('Private witness operation failed; original detail withheld'),{detailSha256:createHash('sha256').update(detail).digest('hex'),detailBytes:Buffer.byteLength(detail)});}
     |                                                                                                         ^ Error: Private witness operation failed; original detail withheld
  52 | export async function finishPrivateWitness({journal,persist,stop,audits}){
  53 |  const errors=[];try{await stop();}catch(error){errors.push(safePrivateError(error));}
  54 |  for(const audit of audits)try{await audit();}catch(error){errors.push(safePrivateError(error));}
  55 |  journal.integrityPreserved=errors.length===0;journal.state=journal.completed&&errors.length===0?'completed':'recovery-required';persist();if(errors.length)throw new AggregateError(errors,'Private witness audits failed; owned ledger retained');
  56 | }
  57 | 
```