import assert from 'node:assert/strict';
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
 for(const a of probe.privateArtifacts)assert.equal(a.present,true,'No private staging cleanup is authorized');return probe;
}
/** Serial actual owner RPCs. A timeout/refusal/malformed ack/status/probe immediately stops the loop. */
export async function resumeToPublication({initial,advance,status,probe,onObserved=(_v)=>{},now=()=>Date.now(),maxSteps=250,maxMs=1800000}){
 let job=initial;assert.equal(job.state,'active');assert.equal(job.checkpoint,78);const started=now();
 for(let n=0;job.state==='active';n++){
  assert.ok(n<maxSteps&&now()-started<maxMs,'Bounded same-job continuation exceeded its observation budget');
  const before=structuredClone(job),at=now();await onObserved({stage:'before-advance',at,payload:{planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:job.checkpoint}});
  let response;try{response=await advance({planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:job.checkpoint});}catch(error){await onObserved({stage:'advance-transport-error',at:now(),elapsedMs:now()-at,error:String(error)});throw error;}
  await onObserved({stage:'advance-response',at:now(),elapsedMs:now()-at,before:before.checkpoint,response});
  assert.equal(response?.httpStatus,200);assert.equal(response.outerSuccess,true);assert.equal(response.body?.success,true,response.body?.error);job=resumedJob(response.body.job,before);
  if(response.body.report){assert.equal(job.state,'complete');assert.equal(response.body.report.id,retained.reportId);assert.match(response.body.report.hash,/^[a-f0-9]{64}$/);}
  const fresh=await status();await onObserved({stage:'fresh-status',at:now(),job:fresh});assert.deepEqual(fresh,job,'Saved checkpoint differs from acknowledgement');
  await probe(job);await onObserved({stage:'checkpoint-verified',at:now(),job});
 }
 assert.equal(job.state,'complete');return job;
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
