import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {retained,checkedJob} from './seventeenth-report-recovery-contract.mjs';
import {verifyCaptureProbe} from './report-capture-cleanup.mjs';
export const sourceReceiptSha='7226d8e907632eaf8c2d464b50c3a48ba701bd639f9a4ac0af92bf9078eecba5';
export function admitForecastResume(journal,digest,previous){
 assert.equal(digest,sourceReceiptSha);assert.deepEqual(journal.retained,retained);assert.equal(journal.phase,'readonly');assert.equal(journal.completed,true);assert.equal(journal.sourceAndPreferencesPreserved,true);assert.equal(journal.advanceCalls,0);assert.equal(journal.forensicCalls.length,1);assert.equal(journal.forensicCalls[0].httpStatus,200);assert.equal(journal.forensicCalls[0].body.mode,'source');assert.equal(journal.forensicCalls[0].body.committed,false);assert.equal(journal.forensicCalls[0].body.readOnly,true);assert.equal(journal.forensicDiagnostic.sha256,'e34de3b28b3ea07ed53f0b78e93abdf19cd9c5ffb9565d0c4980d79f0bf7a669');
 assert.deepEqual(journal.finalJob,previous.job);assert.equal(journal.probes.length,2);for(const p of journal.probes)assert.deepEqual(p,previous.probe);assert.deepEqual(journal.finalProbe,previous.probe);assert.deepEqual(journal.forensicCalls[0].body.source,journal.expectedSource);assert.ok(!journal.events.some(e=>e.stage.includes('error')));return previous;
}
export function resumedJob(next,previous){
 checkedJob(next);for(const k of ['id','requestId','reportId','name','createdAt','expiresAt'])assert.equal(next[k],previous[k],`Retained ${k} changed`);assert.ok(['active','complete'].includes(next.state),'Failed or cancelled capture cannot advance');assert.equal(next.cleanupDone,false,'Recovery never performs cleanup');assert.equal(next.checkpoint,previous.checkpoint+1,'Exactly one checkpoint must be acknowledged');assert.equal(next.completedUnits,next.checkpoint);assert.ok(Number.isSafeInteger(next.totalUnits)&&next.totalUnits>=next.completedUnits);assert.ok(typeof next.stageLabel==='string'&&next.stageLabel.trim());return next;
}
export function preservedArtifacts(probe,job,original){
 verifyCaptureProbe(probe,{planId:retained.planId,jobId:retained.jobId,...job});const byHash=new Map(probe.privateArtifacts.map(a=>[a.keyHash,a]));
 for(const before of original.privateArtifacts){assert.deepEqual(byHash.get(before.keyHash),before,'Original retained artifact changed or vanished');}
 for(const a of probe.privateArtifacts)assert.equal(a.present,true,'No private staging cleanup is authorized');const completed=job.forecastRuns?.completed??0;for(let run=0;run<40;run++){const keyHash=createHash('sha256').update(JSON.stringify(`p:${retained.planId}:report-jobs:data:${retained.jobId}:forecast-run-${run}`)).digest('hex'),header=byHash.get(keyHash);if(run<completed)assert.equal(header?.present,true,'Acknowledged full run lacks its exact retained header');else assert.equal(header,undefined,'A future run header appeared before its acknowledgement');}return probe;
}
/** Same40 retained seeded runs, one per acknowledged run stage; bookkeeping cannot masquerade as a run. */
export function createForecastProgress(){
 let initialized=false,completed=0,runAcknowledgements=0;const labels=new Set();
 return {accept(next,before){
  assert.deepEqual(Object.keys(next.forecastRuns||{}).sort(),['completed','total']);assert.equal(next.forecastRuns.total,40);const count=next.forecastRuns.completed;assert.ok(Number.isSafeInteger(count)&&count>=0&&count<=40);
  if(!initialized){assert.equal(before.forecastRuns,undefined);assert.equal(count,0);assert.equal(next.stageLabel,'Calculating forecast runs');initialized=true;}
  else{assert.deepEqual(before.forecastRuns,{completed,total:40});const running=before.stageLabel==='Calculating forecast runs';assert.equal(count,completed+(running?1:0),'Only an actual full-run checkpoint increments progress');if(running){assert.ok(completed<40);runAcknowledgements++;}else assert.equal(completed,40,'No aggregation/publication before all40 runs');}
  completed=count;labels.add(next.stageLabel);return {completed,total:40,runAcknowledgements};
 },finish(job){assert.equal(initialized,true);assert.equal(completed,40);assert.equal(runAcknowledgements,40);assert.deepEqual(job.forecastRuns,{completed:40,total:40});for(const label of ['Calculating forecast runs','Combining forecast runs','Verifying forecast results','Preparing the retained schedule','Preparing forecast results'])assert.ok(labels.has(label),`Missing acknowledged ${label}`);return {completed,total:40,runAcknowledgements,labels:[...labels]};}};
}
/** Serial actual owner RPCs. A timeout/refusal/malformed ack/status/probe immediately stops the loop. */
export async function resumeToPublication({initial,advance,status,probe,onObserved=(_v)=>{},now=()=>Date.now(),maxSteps=250,maxMs=1800000}){
 let job=initial;const progress=createForecastProgress();assert.equal(job.state,'active');assert.equal(job.checkpoint,78);const started=now();
 for(let n=0;job.state==='active';n++){
  assert.ok(n<maxSteps&&now()-started<maxMs,'Bounded same-job continuation exceeded its observation budget');
  const before=structuredClone(job),at=now();await onObserved({stage:'before-advance',at,payload:{planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:job.checkpoint}});
  let response;try{response=await advance({planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:job.checkpoint});}catch(error){await onObserved({stage:'advance-transport-error',at:now(),elapsedMs:now()-at,error:String(error)});throw error;}
  await onObserved({stage:'advance-response',at:now(),elapsedMs:now()-at,before:before.checkpoint,response});
  assert.equal(response?.httpStatus,200);assert.equal(response.outerSuccess,true);assert.equal(response.body?.success,true,response.body?.error);job=resumedJob(response.body.job,before);const runProgress=progress.accept(job,before);await onObserved({stage:'forecast-progress',at:now(),...runProgress});
  if(response.body.report){assert.equal(job.state,'complete');assert.equal(response.body.report.id,retained.reportId);assert.match(response.body.report.hash,/^[a-f0-9]{64}$/);}
  const fresh=await status();await onObserved({stage:'fresh-status',at:now(),job:fresh});assert.deepEqual(fresh,job,'Saved checkpoint differs from acknowledgement');
  await probe(job);await onObserved({stage:'checkpoint-verified',at:now(),job});
 }
 assert.equal(job.state,'complete');await onObserved({stage:'forecast-complete',at:now(),...progress.finish(job)});return job;
}
export const UI_READS=Object.freeze(['listPlans','getPlan','getAllIssues','getIssues','getIssue','getPlanVersion','getPlanCalendar','getPlanSchedule','getIndexingProgress','getDraft','getActiveDrafts','getLockStatus','getNotifications','checkConflicts','checkDraftOverlaps','checkUserRole','getCurrentUser','getFullConfig','getHolidays','getWorkingDaysConfig','getFieldConfig','getEngineConfig','getAiConfig','getPresence','getWritability','getPlanAssets','getAssetsFields','getAssetsWorkspaces','getSimulationModel','listSnapshots','getSnapshot','getBaseline','getTargets','listForecastEvaluations','listForecastObservations','getCapacitySettings','getCapacityReport','getSponsorReportCapture','listSponsorReports','getSponsorReport','getSponsorReportPage']);
// Exact registrations read in src/resolvers and the PlanView/PlanningWorkspace hooks. No prefix grants authority.
// Only the selected owned plan's normal UI presence bookkeeping may accompany read/export.
export function uiRequestClass(call){
 if(!call?.functionKey)return 'unrelated';const key=call.functionKey;
 if(UI_READS.includes(key))return 'read';
 if(['presenceBeat','presenceLeave'].includes(key)&&call.payload?.planId===retained.planId)return 'owned-presence';
 return 'forbidden';
}
