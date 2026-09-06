import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {legacyForecastInput} from './report-legacy-upgrade-contract.mjs';
import {prepareSponsorReport,reportForecast,reportIssueRows,reportSummary,sponsorReportHtml} from '../../tests/seventeenth-forecast-resume/old-producer-frozen.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const privateHash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export const privateAccount='712020:937bc860-eec2-4294-a65d-8e0fe7c45086';
export function admitPrivatePhase(value){if(value===undefined||value==='')return false;assert.equal(value,'owner');return true;}
const instant=x=>{assert.equal(typeof x,'string');assert(Number.isFinite(Date.parse(x)));};
export function admitPrivateSource(source,name){
 const m=source?.meta;assert.match(m?.id||'',/^plan-test-[a-z0-9-]+$/);assert.equal(m.name,name);assert(name.startsWith('[harness-test]'));assert.equal(m.createdBy,'harness');assert.equal(m.mode,undefined);assert.equal(m.status,'indexed');assert.equal(m.issueCount,1);assert.deepEqual(m.sources,[{id:'src-0',type:'jql',label:'harness',query:'key = WFH-2820',boardId:null,projectKey:null}]);assert.equal(source.issues.length,1);assert.equal(String(source.issues[0].id),'25020');assert.equal(source.issues[0].key,'WFH-2820');return {planId:m.id,name:m.name,kind:'source'};
}
export function verifyPrivateSnapshot(snapshot,source,calendar,name){
 assert.equal(snapshot.assetsReadState,'requires-current-user-read');
 const expected=legacyForecastInput(source,calendar);assert.deepEqual(snapshot.issues,expected.input.issues);assert.deepEqual(snapshot.calendar,calendar);assert.deepEqual(snapshot.milestones,[]);assert.deepEqual(snapshot.sources,source.meta.sources);assert.equal(snapshot.name,name);assert.equal(snapshot.kind,'scenario');assert.equal(snapshot.uncertainty,'medium');assert.equal(snapshot.sourceVersion,source.meta.version);assert.equal(snapshot.createdBy,privateAccount);assert.equal(snapshot.planId,source.meta.id);assert.equal(snapshot.mode,undefined);assert.equal(snapshot.workingChangeCount,0);assert.equal(snapshot.state,'complete');assert.equal(snapshot.schemaVersion,1);assert.equal(snapshot.issueCount,1);assert.equal(snapshot.chunkCount,1);assert.deepEqual(snapshot.chunkHashes,[privateHash(snapshot.issues)]);instant(snapshot.takenAt);
 assert.deepEqual(snapshot.consistency,{method:'two-matching-reads',basisHash:privateHash({meta:source.meta,issues:source.issues,calendar,deps:{}}),observedAt:snapshot.consistency.observedAt});instant(snapshot.consistency.observedAt);
 const {assetsReadState,id,planId,schemaVersion,issueCount,chunkCount,chunkHashes,hash,state,issues,...details}=snapshot;assert.match(id,/^[a-zA-Z0-9_-]{1,100}$/);assert.equal(hash,privateHash({details,issues}));return expected;
}
export function admitPrivateForkIdentity({ack,source,snapshot,name}){
 assert.equal(ack?.success,true);const p=ack.plan;assert.match(p?.id||'',/^sim-[0-9a-f-]{36}$/);assert.equal(p.name,name);assert.equal(p.createdBy,privateAccount);assert.equal(p.mode,'simulation');assert.deepEqual(p.sources,[]);assert.deepEqual(p.members,[]);assert.equal(p.defaultAccess,'none');assert.equal(p.protectionEnabled,false);assert.equal(p.includeParents,false);assert.equal(p.issueCount,1);assert.equal(p.version,1);assert.equal(p.status,'indexed');assert.equal(p.simulationDeleted,undefined);assert.equal(p.simulationGeneration,p.simulationScopeBasis);assert.match(p.simulationGeneration,/^[a-zA-Z0-9_-]{1,100}$/);
 assert.deepEqual(p.simulationProvenance,{sourcePlanId:source.meta.id,snapshotId:snapshot.id,snapshotHash:snapshot.hash,snapshotTakenAt:snapshot.takenAt,sources:source.meta.sources,createdAt:p.simulationProvenance.createdAt});instant(p.simulationProvenance.createdAt);
 return p;
}
export function admitPrivateFork({ack,source,snapshot,name,planRead,modelRead}){
 const p=admitPrivateForkIdentity({ack,source,snapshot,name});
 assert.deepEqual(planRead,{success:true,plan:p});assert.equal(modelRead.success,true);assert.equal(modelRead.version,p.version);assert.deepEqual(modelRead.model,modelRead.scopeBasis);
 const m=modelRead.model;assert.equal(m.id,p.simulationGeneration);assert.equal(m.planId,p.id);assert.equal(m.state,'complete');assert.equal(m.createdBy,privateAccount);assert.equal(m.mode,'simulation');assert.equal(m.name,name);assert.equal(m.assetsReadState,'requires-current-user-read');assert.deepEqual(m.sources,[]);assert.deepEqual(m.calendar,snapshot.calendar);assert.deepEqual(m.milestones,snapshot.milestones);assert.equal(m.uncertainty,'medium');assert.deepEqual(m.issues,snapshot.issues.map(i=>({...i,capturedDuration:true})));assert(m.issues.every(i=>!Object.hasOwn(i,'assets')),'This witness requires the unconfigured source Assets shape');
 const {assetsReadState,id,planId,schemaVersion,issueCount,chunkCount,chunkHashes,hash,state,issues,...details}=m;assert.equal(schemaVersion,1);assert.equal(issueCount,1);assert.equal(chunkCount,1);assert.deepEqual(chunkHashes,[privateHash(issues)]);assert.equal(hash,privateHash({details,issues}));
 return {planId:p.id,name:p.name,kind:'private',plan:structuredClone(p),modelRead:structuredClone(modelRead)};
}
export function privateReportOracle({owner,job,summary,name,captureWindow}){
 const {plan:p,modelRead:{model}}=owner;assert.equal(job.state,'complete');assert.equal(job.cleanupDone,true);assert.equal(job.reportId,summary.id);assert.equal(job.name,name);assert.equal(job.forecastRuns.completed,300);assert.equal(job.forecastRuns.total,300);
 const captured={mode:'simulation',issues:model.issues,calendar:model.calendar,milestones:model.milestones,uncertainty:'medium'};
 const forecast=reportForecast(captured).forecast;assert.equal(forecast.runs,300);assert.equal(forecast.p50,'2026-10-09');assert.equal(forecast.p80,'2026-10-12');assert.equal(forecast.p90,'2026-10-12');assert.equal(forecast.onPlannedFinish,197/300);
 const {assetsReadState,...rawModel}=model;
 const consistency={method:'two-matching-reads',basisHash:privateHash({meta:p,issues:rawModel.issues,calendar:model.calendar,deps:{}}),observedAt:summary.consistency.observedAt,verifiedAfterAnalysisAt:summary.consistency.verifiedAfterAnalysisAt};instant(consistency.observedAt);instant(consistency.verifiedAfterAnalysisAt);assert(Date.parse(consistency.observedAt)<=Date.parse(consistency.verifiedAfterAnalysisAt));instant(summary.takenAt);assert(Date.parse(summary.takenAt)>=captureWindow.startMs&&Date.parse(summary.takenAt)<=captureWindow.endMs);
 const rows=reportIssueRows(captured),input={mode:'simulation',name,planName:p.name,sourceVersion:p.version,calendar:model.calendar,uncertainty:'medium',workingChangeCount:0,targets:[],forecast,id:job.reportId,takenAt:summary.takenAt,createdBy:privateAccount,issues:rows,baseline:null,consistency,capacity:{state:'not-included',scope:'captured-plan',reason:'Capacity was not included at capture. No availability is assumed.'},sections:{timeline:rows,targets:[],changes:[]}};
 const prepared=prepareSponsorReport(p.id,input),expected=reportSummary({...prepared.current.descriptor,state:'complete',issues:rows},null);assert.deepEqual(summary,expected);
 const pages=prepared.pages.map(({key,rows})=>{const [,section,n]=key.match(/:page:[^:]+:([^:]+):(\d+)$/);return{reportId:expected.id,hash:expected.hash,section,page:Number(n),pageCount:expected.pages[section],total:expected.counts[section],pageHash:privateHash(rows),rows};});
 return {summary:expected,pages,html:sponsorReportHtml(expected,pages),forecastInputHash:forecast.inputHash};
}
function cancelledSuccessor(previous,next){
 assert.equal(next?.state,'cancelled');for(const key of ['id','requestId','reportId','name','createdAt','expiresAt'])assert.equal(next[key],previous[key]);assert(Number.isSafeInteger(previous.checkpoint));assert(Number.isSafeInteger(next.checkpoint));assert.equal(next.checkpoint,previous.checkpoint+1);assert.equal(typeof next.cleanupDone,'boolean');return next;
}
export function privateDeletedState(previous,next){
 assert.equal(previous.state,'complete');assert.equal(previous.cleanupDone,true);cancelledSuccessor(previous,next);assert.equal(next.cleanupDone,false);return next;
}
export function privateCleanupStep(previous,next){
 assert.equal(previous.state,'cancelled');assert.equal(previous.cleanupDone,false);return cancelledSuccessor(previous,next);
}
export function safePrivateError(error){const detail=String(error?.message??error);return Object.assign(new Error('Private witness operation failed; original detail withheld'),{detailSha256:createHash('sha256').update(detail).digest('hex'),detailBytes:Buffer.byteLength(detail)});}
export async function finishPrivateWitness({journal,persist,stop,audits}){
 const errors=[];try{await stop();}catch(error){errors.push(safePrivateError(error));}
 for(const audit of audits)try{await audit();}catch(error){errors.push(safePrivateError(error));}
 journal.integrityPreserved=errors.length===0;journal.state=journal.completed&&errors.length===0?'completed':'recovery-required';persist();if(errors.length)throw new AggregateError(errors,'Private witness audits failed; owned ledger retained');
}
