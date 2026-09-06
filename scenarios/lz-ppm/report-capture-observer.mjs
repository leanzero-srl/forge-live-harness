import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const writes=new Set(['captureSponsorReport','advanceSponsorReportCapture','cancelSponsorReportCapture']);
const calls=new Set([...writes,'getSponsorReportCapture']);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Independent recorder of real UI calls. It never advances, retries or repairs a job. */
export function createReportCaptureObserver({planId,onState=(_state)=>{},now=()=>Date.now(),initialJob=null}) {
 const events=[],pending=new Map(),waiters=new Set();let job=null,report=null,error=null,begin=null,writePending=null;
 if(initialJob!==null){
  assert.ok(initialJob&&typeof initialJob==='object'&&!Array.isArray(initialJob));
  for(const key of ['id','requestId','reportId','name','stageLabel'])assert.ok(typeof initialJob[key]==='string'&&initialJob[key]);
  assert.equal(initialJob.state,'active');assert.equal(initialJob.cleanupDone,false);
  for(const key of ['checkpoint','completedUnits','totalUnits'])assert.ok(Number.isSafeInteger(initialJob[key])&&initialJob[key]>=0);
  assert.ok(initialJob.completedUnits<=initialJob.totalUnits);
  for(const key of ['createdAt','expiresAt'])assert.ok(typeof initialJob[key]==='string'&&Number.isFinite(Date.parse(initialJob[key])));
  assert.ok(Date.parse(initialJob.expiresAt)>Date.parse(initialJob.createdAt));
  job=structuredClone(initialJob);events.push({type:'admitted-existing-job',job:structuredClone(job),at:now()});
 }
 const snapshot=()=>({planId,job,report,error:error?{name:error.name,message:error.message}:null,begin,events:[...events]});
 const notify=()=>{onState(snapshot());for(const w of [...waiters])w();};
 const fail=cause=>{error??=cause instanceof Error?cause:new Error(String(cause));notify();};
 function request(id,call){
  if(!calls.has(call?.functionKey)||call?.payload?.planId!==planId)return false;
  try{
   const {functionKey:key,payload}=call;
   if(key==='captureSponsorReport'){
    assert.equal(initialJob,null,'A resumed capture observer cannot accept a begin');
    assert.equal(begin,null,'A capture observer cannot silently accept a second begin');
    assert.equal(typeof payload.requestId,'string');assert.ok(payload.requestId);
    begin={requestId:payload.requestId,name:payload.name,inputHash:hash(payload),at:now()};
   }else if(!begin&&!job)return false;
   if(payload.jobId&&job)assert.equal(payload.jobId,job.id,'Request belongs to another capture');
   if(writes.has(key)){assert.equal(writePending,null,'UI dispatched overlapping capture mutations');writePending=id;}
   if(key==='advanceSponsorReportCapture'){assert.ok(job,'Advance before acknowledged job');assert.equal(payload.expectedCheckpoint,job.checkpoint,'Advance must use last acknowledged checkpoint');assert.equal(job.state,'active');}
   pending.set(id,{key,payload,startedAt:now()});events.push({type:'request',key,jobId:payload.jobId||null,expectedCheckpoint:payload.expectedCheckpoint??null,at:now()});notify();return true;
  }catch(e){fail(e);return false;}
 }
 function response(id,body){
  const call=pending.get(id);if(!call)return;
  pending.delete(id);if(writePending===id)writePending=null;
  try{
   assert.ok(body&&body.success===true,`${call.key}: ${body?.error||'No successful resolver body'}`);
   assert.ok(Object.hasOwn(body,'job'),'Capture response must include job');const next=body.job;
   assert.ok(next,'An observed capture cannot disappear');
   for(const key of ['createdAt','expiresAt']){assert.equal(typeof next[key],'string');assert.ok(Number.isFinite(Date.parse(next[key])),`Invalid ${key}`);}assert.ok(Date.parse(next.expiresAt)>Date.parse(next.createdAt));
   assert.equal(typeof next.id,'string');assert.ok(next.id);assert.ok(['active','complete','cancelled','failed'].includes(next.state));
   for(const key of ['checkpoint','completedUnits','totalUnits'])assert.ok(Number.isSafeInteger(next[key])&&next[key]>=0,`Invalid ${key}`);
   assert.ok(next.completedUnits<=next.totalUnits);assert.equal(typeof next.cleanupDone,'boolean');assert.equal(typeof next.stageLabel,'string');
   assert.ok(next.state!=='active'||!next.cleanupDone,'An active job cannot be cleaned');
   if(begin){assert.equal(next.requestId,begin.requestId);assert.equal(next.name,begin.name);}
   if(job){assert.equal(next.id,job.id);assert.equal(next.requestId,job.requestId);assert.equal(next.name,job.name);if(job.reportId!=null)assert.equal(next.reportId,job.reportId,'Known report identity changed');assert.equal(next.createdAt,job.createdAt);assert.equal(next.expiresAt,job.expiresAt);assert.ok(next.checkpoint>=job.checkpoint,'Checkpoint regressed');
    if(call.key==='advanceSponsorReportCapture'&&next.state==='active')assert.ok(next.checkpoint>job.checkpoint,'Advance made no acknowledged progress');
    if(call.key==='cancelSponsorReportCapture'&&!next.cleanupDone)assert.ok(next.checkpoint>job.checkpoint,'Cleanup made no acknowledged progress');
    if(job.state==='complete')assert.equal(next.state,'complete','Private cleanup must preserve publication');
    if(job.state==='cancelled')assert.equal(next.state,'cancelled','Cancellation is irreversible');
   }
   if(body.report){assert.equal(next.state,'complete');assert.equal(body.report.id,next.reportId);assert.match(body.report.hash,/^[a-f0-9]{64}$/);if(report)assert.deepEqual(body.report,report,'Published report changed between checkpoints');report=structuredClone(body.report);}
   job=structuredClone(next);events.push({type:'response',key:call.key,job:structuredClone(next),at:now(),elapsedMs:now()-call.startedAt});notify();
  }catch(e){fail(e);}
 }
 function transportFailure(id,cause){if(pending.has(id)){pending.delete(id);if(writePending===id)writePending=null;fail(cause);}}
 function wait(predicate,timeoutMs=120000){
  return new Promise((resolve,reject)=>{let timer;const check=()=>{if(error){clearTimeout(timer);waiters.delete(check);reject(error);return;}const state=snapshot();if(predicate(state)){clearTimeout(timer);waiters.delete(check);resolve(state);}};waiters.add(check);timer=setTimeout(()=>{waiters.delete(check);const e=new Error(`Capture observation deadline (${timeoutMs}ms): ${JSON.stringify({job,error:snapshot().error})}`);fail(e);reject(e);},timeoutMs);check();});
 }
 return {request,response,transportFailure,fail,snapshot,wait,dispose:()=>{for(const w of [...waiters]){fail(new Error('Capture observer disposed before completion'));w();}waiters.clear();}};
}
