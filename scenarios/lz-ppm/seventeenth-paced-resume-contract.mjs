import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retained,checkedJob} from './seventeenth-report-recovery-contract.mjs';
import {resumedJob,preservedArtifacts,createForecastProgress} from './seventeenth-forecast-resume-contract.mjs';
export const failedSha='333e483b880dae0c81e9369e461c612c8dd99d8daa4e9ee6f4fb9e702b5a02f7';
export const recoveredSha='847489b867f3481372340e39a0263ef09537d1b95973415849c5679ef5046079';
const sha=x=>createHash('sha256').update(x).digest('hex');
/** Replay every real acknowledged transition and physical proof; never seed40 from a counter alone. */
export function admitPacedResume(failed,digest,recovered,recoveryDigest,previous){
 assert.equal(digest,failedSha);assert.equal(recoveryDigest,recoveredSha);assert.deepEqual(failed.retained,retained);assert.equal(failed.sourceReceipt.sha256,'7226d8e907632eaf8c2d464b50c3a48ba701bd639f9a4ac0af92bf9078eecba5');assert.equal(failed.completed,false);assert.equal(failed.publicationObserved,false);assert.equal(failed.sourceAndPreferencesPreserved,false);assert.equal(failed.advanceCalls,48);assert.equal(failed.probes.length,48);assert.deepEqual(failed.probes[0],previous.probe);
 const acks=failed.events.filter(e=>e.stage==='advanceSponsorReportCapture').map(e=>e.value);assert.equal(acks.length,48);const statuses=failed.events.filter(e=>e.stage==='getSponsorReportCapture'&&e.value?.body?.success===true).map(e=>e.value.body.job);const progress=createForecastProgress();let job=previous.job;
 for(let n=0;n<acks.length;n++){const ack=acks[n];assert.equal(ack.httpStatus,200);assert.equal(ack.outerSuccess,true);assert.equal(ack.body.success,true);assert.equal(sha(ack.raw),ack.responseSha256);assert.equal(Buffer.byteLength(ack.raw),ack.responseBytes);const actual=JSON.parse(ack.raw).data.invokeExtension;assert.equal(actual.success,true);assert.deepEqual(actual.response.body,ack.body);const next=resumedJob(ack.body.job,job);progress.accept(next,job);
  if(n<47){assert.ok(statuses.some(s=>JSON.stringify(s)===JSON.stringify(next)),'Missing actual saved status');const physical=failed.probes[n+1];assert.equal(physical.checkpoint,next.checkpoint);preservedArtifacts(physical,next,failed.probes[n]);}
  job=next;
 }
 assert.equal(job.checkpoint,126);assert.equal(job.stageLabel,'Combining forecast runs');assert.deepEqual(job.forecastRuns,{completed:40,total:40});assert.deepEqual(failed.finalJob,acks[46].body.job);assert.deepEqual(failed.finalProbe,failed.probes[47]);assert.equal(failed.finalProbe.privateArtifacts.length,181);
 assert.equal(recovered.phase,'one-read-only-admission');assert.equal(recovered.sourceJournal.sha256,failedSha);assert.deepEqual(recovered.retained,retained);assert.deepEqual(recovered.query,{what:'reportCaptureState',planId:retained.planId,jobId:retained.jobId});assert.equal(recovered.method,'GET');assert.equal(recovered.requestBodyBytes,0);assert.equal(recovered.requestCount,1);assert.equal(recovered.completed,true);assert.equal(recovered.httpStatus,200);assert.equal(sha(recovered.raw),recovered.responseSha256);assert.equal(Buffer.byteLength(recovered.raw),recovered.responseBytes);assert.deepEqual(JSON.parse(recovered.raw),recovered.body);assert.ok(recovered.startedMs>failed.lastWriteReturnedMs+240000);preservedArtifacts(recovered.body,job,failed.finalProbe);assert.equal(recovered.body.checkpoint,126);assert.equal(recovered.body.privateArtifacts.length,182);assert.equal(recovered.body.publicArtifacts.length,0);return {job,probe:recovered.body,progress};
}
/** At most100 remaining exact checkpoints. Pacing is external; no retry on any failed observation. */
export async function continuePacedReport({initial,progress,advance,status,probe,onObserved=(_v)=>{},now=()=>performance.now(),maxSteps=100,maxMs=7200000}){
 let job=checkedJob(initial);assert.equal(job.state,'active');assert.equal(job.checkpoint,126);assert.deepEqual(job.forecastRuns,{completed:40,total:40});const started=now();
 for(let n=0;job.state==='active';n++){
  assert.ok(n<maxSteps&&now()-started<maxMs,'Explicit paced continuation deadline or checkpoint bound reached');const before=structuredClone(job);await onObserved({stage:'before-advance',wallTime:new Date().toISOString(),payload:{planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:job.checkpoint}});
  const response=await advance({planId:retained.planId,jobId:retained.jobId,expectedCheckpoint:job.checkpoint},before);await onObserved({stage:'advance-response',before:before.checkpoint,response});assert.equal(response?.httpStatus,200);assert.equal(response.outerSuccess,true);assert.equal(response.body?.success,true,response.body?.error);job=resumedJob(response.body.job,before);await onObserved({stage:'forecast-progress',...progress.accept(job,before)});
  if(response.body.report){assert.equal(job.state,'complete');assert.equal(response.body.report.id,retained.reportId);assert.match(response.body.report.hash,/^[a-f0-9]{64}$/);}
  const fresh=await status();await onObserved({stage:'fresh-status',job:fresh});assert.deepEqual(fresh,job);await probe(job);await onObserved({stage:'checkpoint-verified',job});
 }
 assert.equal(job.state,'complete');await onObserved({stage:'forecast-complete',...progress.finish(job)});return job;
}
