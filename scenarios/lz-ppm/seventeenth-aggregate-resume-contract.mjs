import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retained,checkedJob} from './seventeenth-report-recovery-contract.mjs';
import {resumedJob,preservedArtifacts} from './seventeenth-forecast-resume-contract.mjs';
export const pacedFailureSha='4a7b7bba5d81bed6d83cf6c2b91ca669786313e591757aca259c4e478fd460d0';
const sha=x=>createHash('sha256').update(x).digest('hex');
const refusal='The report capture could not complete this step. Reload its status and retry, or finish cleanup before creating a fresh report.';
/** Replay actual successful126→127 and refused127; no synthesized acknowledgement or repaired prior proof. */
export function admitAggregateResume(failed,digest,previous){
 assert.equal(digest,pacedFailureSha);assert.equal(failed.phase,'paced-resume126');assert.deepEqual(failed.retained,retained);assert.equal(failed.failedReceipt.sha256,'333e483b880dae0c81e9369e461c612c8dd99d8daa4e9ee6f4fb9e702b5a02f7');assert.equal(failed.quotaAdmission.sha256,'847489b867f3481372340e39a0263ef09537d1b95973415849c5679ef5046079');assert.equal(failed.sourceReceipt.sha256,'7226d8e907632eaf8c2d464b50c3a48ba701bd639f9a4ac0af92bf9078eecba5');
 assert.equal(failed.completed,false);assert.equal(failed.publicationObserved,false);assert.equal(failed.sourceAndPreferencesPreserved,true);assert.equal(failed.advanceCalls,2);assert.equal(failed.probes.length,3);assert.deepEqual(failed.probes[0],previous.probe);
 const dispatched=failed.events.filter(e=>e.stage==='actual-advance-dispatch').map(e=>e.value);assert.equal(dispatched.length,2);for(let n=0;n<2;n++)assert.deepEqual(dispatched[n].payload,{planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:126+n});
 const replies=failed.events.filter(e=>e.stage==='advanceSponsorReportCapture').map(e=>e.value);assert.equal(replies.length,2);for(let n=0;n<2;n++){const reply=replies[n];assert.equal(reply.startedMs,dispatched[n].startedMs);assert.ok(reply.returnedMs>=reply.startedMs);assert.equal(reply.httpStatus,200);assert.equal(reply.outerSuccess,true);assert.equal(reply.errors,null);assert.equal(sha(reply.raw),reply.responseSha256);assert.equal(Buffer.byteLength(reply.raw),reply.responseBytes);const outer=JSON.parse(reply.raw).data.invokeExtension;assert.equal(outer.success,true);assert.deepEqual(outer.response.body,reply.body);}
 assert.equal(replies[0].body.success,true);const job=resumedJob(replies[0].body.job,previous.job);assert.equal(job.checkpoint,127);assert.equal(job.stageLabel,'Verifying forecast results');assert.deepEqual(job.forecastRuns,{completed:40,total:40});previous.progress.accept(job,previous.job);
 assert.deepEqual(replies[1].body,{success:false,error:refusal});assert.equal(failed.lastWriteStartedMs,replies[1].startedMs);assert.ok(failed.lastWriteReturnedMs>=replies[1].returnedMs);assert.deepEqual(failed.finalJob,job);
 const statuses=failed.events.filter(e=>e.stage==='getSponsorReportCapture').map(e=>e.value);assert.equal(statuses.length,3);assert.deepEqual(statuses[0].body.job,previous.job);for(const status of statuses.slice(1)){assert.equal(status.httpStatus,200);assert.equal(status.outerSuccess,true);assert.equal(status.body.success,true);assert.deepEqual(status.body.job,job);}
 for(const probe of failed.probes.slice(1)){preservedArtifacts(probe,job,previous.probe);assert.equal(probe.privateArtifacts.length,183);assert.equal(probe.publicArtifacts.length,0);}assert.deepEqual(failed.probes[1],failed.probes[2]);assert.deepEqual(failed.finalProbe,failed.probes[2]);
 assert.equal(failed.events.filter(e=>e.stage==='body-error').length,1);assert.equal(failed.events.filter(e=>e.stage==='independent-audit-error').length,0);assert.ok(failed.events.find(e=>e.stage==='body-error').value.includes(refusal));const prefs=failed.events.filter(e=>e.stage==='getCapacitySettings').slice(-2);assert.equal(prefs.length,2);for(const e of prefs)assert.deepEqual(e.value.body,{success:true,version:65,settings:{selectedPlanIds:[],profiles:{},issueChoices:{}}});
 return {job,probe:failed.finalProbe,progress:previous.progress};
}
/** Exactly56 remaining exact checkpoints. Pacing is external; no retry on any failed observation. */
export async function continueAggregateReport({initial,progress,advance,status,probe,onObserved=(_v)=>{},now=()=>performance.now(),maxSteps=56,maxMs=7200000}){
 let job=checkedJob(initial);assert.equal(job.state,'active');assert.equal(job.checkpoint,127);assert.deepEqual(job.forecastRuns,{completed:40,total:40});const started=now();
 for(let n=0;job.state==='active';n++){
  assert.ok(n<maxSteps&&now()-started<maxMs,'Explicit paced continuation deadline or checkpoint bound reached');const before=structuredClone(job);await onObserved({stage:'before-advance',wallTime:new Date().toISOString(),payload:{planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:job.checkpoint}});
  const response=await advance({planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:job.checkpoint},before);await onObserved({stage:'advance-response',before:before.checkpoint,response});assert.equal(response?.httpStatus,200);assert.equal(response.outerSuccess,true);assert.equal(response.body?.success,true,response.body?.error);job=resumedJob(response.body.job,before);await onObserved({stage:'forecast-progress',...progress.accept(job,before)});
  if(response.body.report){assert.equal(job.state,'complete');assert.equal(response.body.report.id,retained.reportId);assert.match(response.body.report.hash,/^[a-f0-9]{64}$/);}
  const fresh=await status();await onObserved({stage:'fresh-status',job:fresh});assert.deepEqual(fresh,job);await probe(job);await onObserved({stage:'checkpoint-verified',job});
 }
 assert.equal(job.state,'complete');assert.equal(job.checkpoint,183);await onObserved({stage:'forecast-complete',...progress.finish(job)});return job;
}
