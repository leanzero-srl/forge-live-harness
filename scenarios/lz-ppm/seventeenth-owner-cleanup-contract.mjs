import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {retained} from './seventeenth-report-recovery-contract.mjs';
import {verifyCaptureProbe} from './report-capture-cleanup.mjs';
import {uiRequestClass} from './seventeenth-forecast-resume-contract.mjs';
import {resolverReadCost} from './seventeenth-read-cost.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>sha(JSON.stringify(canonical(x)));
export const REFRESHED_FAILURE_SHA='e56194a5b9f292be2bbace1709f443c15970963a182f258f78961548270c37c6';
const emptyErrors=value=>value==null||Array.isArray(value)&&value.length===0;
function responseBody(value){
 assert.equal(value.rawEncoding,'forge-response-context-token-redacted-v1');assert.equal(sha(value.raw),value.retainedResponseSha256);assert.equal(Buffer.byteLength(value.raw),value.retainedResponseBytes);assert.match(value.responseSha256||'',/^[a-f0-9]{64}$/);assert.ok(value.responseBytes>=value.retainedResponseBytes);const parsed=JSON.parse(value.raw),extension=parsed.data?.invokeExtension;assert.ok(extension&&!Object.hasOwn(extension,'contextToken'));assert.equal(value.httpStatus,200);assert.equal(extension.success,true);assert.equal(value.outerSuccess,true);assert.ok(emptyErrors(extension.errors??parsed.errors??null));assert.ok(emptyErrors(value.errors));assert.deepEqual(extension.response?.body,value.body);return value.body;
}
export const CLEANUP_COST=Object.freeze({private:192,public:352,deleteSponsorReport:224,deletePlan:768});
export function cleanupReadCost(key,phase){if(key==='cancelSponsorReportCapture'){assert.ok(['private','public'].includes(phase));return CLEANUP_COST[phase];}if(Object.hasOwn(CLEANUP_COST,key))return CLEANUP_COST[key];return resolverReadCost(key);}

/** Approval is externally supplied root inspection authority, not inferred from a passing test.
 * All three externally supplied byte digests are mandatory. This helper never creates an approval. */
export function admitOwnerCleanup({journalBytes,journalSha256,inspectionBytes,inspectionSha256,refreshedFailureBytes,refreshedFailureSha256,readFile=fs.readFileSync}){
 for(const digest of [journalSha256,inspectionSha256,refreshedFailureSha256])assert.match(digest||'',/^[a-f0-9]{64}$/,'Externally supplied exact digests required');
 assert.equal(sha(journalBytes),journalSha256);assert.equal(sha(inspectionBytes),inspectionSha256);
 assert.equal(refreshedFailureSha256,REFRESHED_FAILURE_SHA);assert.equal(sha(refreshedFailureBytes),REFRESHED_FAILURE_SHA);
 const failed=JSON.parse(refreshedFailureBytes);assert.equal(failed.phase,'paced-resume155');assert.deepEqual(failed.retained,retained);assert.equal(failed.completed,false);assert.equal(failed.sourceAndPreferencesPreserved,false);assert.equal(failed.publicationObserved,true);assert.equal(failed.all5300ReportFieldsVerified,true);assert.equal(failed.all5300HtmlFieldsVerified,true);assert.ok(!Object.hasOwn(failed,'reopenedAllPagesImmutable'));assert.equal(failed.advanceCalls,28);
 const j=JSON.parse(journalBytes),i=JSON.parse(inspectionBytes);
 assert.equal(i.schema,'retained-report-root-cleanup-approval-v2');assert.equal(i.approveCleanup,true);assert.equal(i.inspectionComplete,true);assert.equal(i.completedJournalSha256,journalSha256);assert.equal(i.refreshedFailureSha256,REFRESHED_FAILURE_SHA);assert.deepEqual(i.retained,retained);
 assert.equal(i.domainVerificationPassed,true);assert.equal(i.ledgerVerificationPassed,true);assert.match(i.rootInspectionCommit||'',/^[a-f0-9]{40}$/);
 assert.equal(j.phase,'readonly-reopen183');assert.equal(j.refreshedFailureReceipt?.sha256,REFRESHED_FAILURE_SHA);assert.deepEqual(j.retained,retained);for(const flag of ['completed','publicationObserved','sourceAndPreferencesPreserved','traceDiscarded','all5300ReportFieldsVerified','all5300HtmlFieldsVerified','reopenedAllPagesImmutable','reviewRequired'])assert.equal(j[flag],true,flag);
 assert.equal(j.aggregateFailureReceipt.sha256,'7be7311c7d5369ccdf70bd9f9144c4ae44111814a7100a9df3a5d72b80afdf67');assert.equal(j.advanceCalls,0);assert.ok(!j.events.some(e=>e.stage.includes('advance')));
 const pageReads=j.events.filter(e=>e.stage==='getSponsorReportPage');assert.equal(pageReads.length,212);for(let n=0;n<212;n++){const body=responseBody(pageReads[n].value);assert.equal(body.success,true);assert.deepEqual(body.page,j.pages[n%106]);}
 const departures=j.events.filter(e=>e.stage==='owned-departure-leave-observed');assert.equal(departures.length,2);assert.equal(new Set(departures.map(e=>e.value.requestId)).size,2);const unmounted=j.events.filter(e=>e.stage==='owned-departure-unmounted');assert.equal(unmounted.length,2);const postblank=j.events.filter(e=>e.stage==='owned-departure-postblank-leaves');assert.equal(postblank.length,2);
 for(let n=0;n<2;n++){const d=departures[n].value;assert.equal(d.planId,retained.planId);const matches=j.uiRequests.filter(r=>r.requestId===d.requestId);assert.equal(matches.length,1);const r=matches[0];assert.equal(r.key,'presenceLeave');assert.equal(r.planId,retained.planId);assert.equal(r.state,'finished');assert.deepEqual(responseBody(r),{success:true});for(const key of ['requestedAtMs','dispatchedAtMs','completedAtMs'])assert.equal(d[key],r[key]);assert.ok(d.requestedAtMs>=d.armedAtMs&&d.dispatchedAtMs>=d.requestedAtMs&&d.completedAtMs>=d.dispatchedAtMs);assert.deepEqual(unmounted[n].value,{planId:retained.planId,requestId:r.requestId});assert.deepEqual(postblank[n].value,[r.requestId]);assert.ok(j.events.indexOf(departures[n])<j.events.indexOf(unmounted[n])&&j.events.indexOf(unmounted[n])<j.events.indexOf(postblank[n]));}
 for(const r of j.uiRequests){assert.equal(r.state,'finished');responseBody(r);assert.ok(['read','owned-presence'].includes(uiRequestClass({functionKey:r.key,payload:r.planId?{planId:r.planId}:{}})));}
 assert.equal(j.probes.length,2);for(const probe of j.probes)assert.deepEqual(probe,j.finalProbe);assert.deepEqual(j.finalJob,failed.finalJob);assert.deepEqual(j.finalProbe,failed.finalProbe);assert.deepEqual(j.report,failed.report);assert.deepEqual(j.pages,failed.pages);
 assert.equal(j.events.filter(e=>['body-error','independent-audit-error','transport-error','ui-budget-or-transport-error'].includes(e.stage)).length,0);
 const job=j.finalJob;assert.equal(job.id,retained.jobId);assert.equal(job.requestId,retained.requestId);assert.equal(job.reportId,retained.reportId);assert.equal(job.state,'complete');assert.equal(job.checkpoint,183);assert.equal(job.cleanupDone,false);assert.deepEqual(job.forecastRuns,{completed:40,total:40});
 verifyCaptureProbe(j.finalProbe,{...retained,...job});assert.equal(j.finalProbe.privateArtifacts.length,188);assert.equal(j.finalProbe.publicArtifacts.length,114);assert.ok(j.finalProbe.privateArtifacts.every(a=>a.present));
 assert.equal(j.report.id,retained.reportId);assert.equal(j.report.counts.timeline,5300);assert.equal(j.report.forecast.runs,40);assert.equal(j.report.forecast.inputHash,'74e3f14bb519b5733ec1a65d729605f63ccebf4e6594b1f1ddf0682b90404e4a');
 assert.equal(j.pages.length,106);assert.equal(j.pages.reduce((n,p)=>n+p.rows.length,0),5300);assert.equal(hash(j.report),i.reportSummaryHash);assert.equal(hash(j.pages),i.pagesHash);assert.equal(hash(j.finalProbe),i.finalProbeHash);
 assert.ok(Array.isArray(i.artifacts));assert.equal(i.artifacts.filter(a=>a.role==='html').length,1);assert.equal(i.artifacts.filter(a=>a.role==='png').length,4);assert.equal(i.artifacts.length,5);assert.equal(new Set(i.artifacts.map(a=>a.path)).size,5);
 for(const a of i.artifacts){assert.equal(typeof a.path,'string');assert.match(a.sha256,/^[a-f0-9]{64}$/);const bytes=readFile(a.path);assert.equal(bytes.length,a.bytes);assert.equal(sha(bytes),a.sha256);if(a.role==='png')assert.equal(Buffer.from(bytes).subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
 const html=i.artifacts.find(a=>a.role==='html');assert.equal(html.sha256,'a35e0b53e15823a552b44696492b486e4229f6230bd730961f7766833075399e');assert.equal(html.bytes,1248688);const download=j.events.find(e=>e.stage==='download-saved')?.value;assert.equal(html.sha256,download?.sha256);assert.equal(html.bytes,download?.bytes);
 return {journal:j,inspection:i,journalSha256,inspectionSha256,refreshedFailureSha256};
}
export function loadOwnerCleanupAdmission(env=process.env){for(const k of ['LZ_CLEANUP_COMPLETED_JOURNAL','LZ_CLEANUP_COMPLETED_SHA256','LZ_CLEANUP_ROOT_INSPECTION','LZ_CLEANUP_ROOT_INSPECTION_SHA256','LZ_CLEANUP_REFRESHED_FAILURE_JOURNAL','LZ_CLEANUP_REFRESHED_FAILURE_SHA256'])assert.ok(env[k],`${k} required before test registration`);return admitOwnerCleanup({journalBytes:fs.readFileSync(env.LZ_CLEANUP_COMPLETED_JOURNAL),journalSha256:env.LZ_CLEANUP_COMPLETED_SHA256,inspectionBytes:fs.readFileSync(env.LZ_CLEANUP_ROOT_INSPECTION),inspectionSha256:env.LZ_CLEANUP_ROOT_INSPECTION_SHA256,refreshedFailureBytes:fs.readFileSync(env.LZ_CLEANUP_REFRESHED_FAILURE_JOURNAL),refreshedFailureSha256:env.LZ_CLEANUP_REFRESHED_FAILURE_SHA256});}

/** Ordinary discovery is inert. Any explicitly requested cleanup phase remains fail-closed before registration. */
export function ownerCleanupAdmissionForPhase(env=process.env){
 const phase=env.LZ_SEVENTEENTH_CLEANUP_PHASE;if(phase==null||phase==='')return null;
 assert.equal(phase,'approved-cleanup','Unsupported explicit owner cleanup phase');
 return loadOwnerCleanupAdmission(env);
}

/** Finite progression, no mutation retries. Acknowledged false-cleanup is continuation, not retry.
 * Transport allowance60s + one61s rolling-window wait per call, plus two10-minute
 * acquisition allowances. This is a stopping deadline, never a latency guarantee. */
export function ownerCleanupBound(maxCalls){assert.ok(Number.isSafeInteger(maxCalls)&&maxCalls>0&&maxCalls<=38);return maxCalls*121000+1200000;}
export async function cleanExactOwner({initial,phase,cancel,record=(_value)=>{},now=()=>performance.now()}){
 assert.ok(['private','public'].includes(phase));assert.equal(initial.id,retained.jobId);assert.equal(initial.requestId,retained.requestId);assert.equal(initial.reportId,retained.reportId);const state=phase==='private'?'complete':'cancelled';assert.equal(initial.state,state);assert.equal(initial.cleanupDone,false);
 const maxCalls=phase==='private'?38:1,maxMs=ownerCleanupBound(maxCalls);const started=now();assert.ok(Number.isFinite(started));let last=started,job=initial;
 for(let n=0;!job.cleanupDone;n++){
  const time=now();assert.ok(Number.isFinite(time)&&time>=last&&time-started<maxMs&&n<maxCalls,'Owner cleanup bound exceeded');last=time;
  await record({stage:'before-owner-cancel',phase,checkpoint:job.checkpoint,maxCalls,maxMs});const result=await cancel({planId:retained.planId,jobId:retained.jobId});await record({stage:'owner-cancel-response',phase,result});assert.equal(result?.success,true,result?.error);
  const next=result.job;assert.equal(next.id,job.id);assert.equal(next.requestId,job.requestId);assert.equal(next.reportId,job.reportId);assert.equal(next.state,state);assert.equal(next.checkpoint,job.checkpoint+1);assert.equal(typeof next.cleanupDone,'boolean');assert.ok(Number.isSafeInteger(next.totalUnits)&&next.totalUnits>=next.completedUnits);assert.equal(next.completedUnits,next.checkpoint);job=next;
  const returned=now();assert.ok(Number.isFinite(returned)&&returned>=last&&returned-started<maxMs,'Owner cleanup deadline exceeded');last=returned;
 }
 return job;
}

export function cleanupUiRequestClass(call,{armedPlanDelete=false}={}){return armedPlanDelete&&call?.functionKey==='deletePlan'&&JSON.stringify(call.payload)===JSON.stringify({planId:retained.planId})?'approved-plan-delete':uiRequestClass(call);}
