import assert from 'node:assert/strict';
export const retained={planId:'plan-test-mtpcju6b-7vzi7e',jobId:'36a9bad5-8276-432f-a42f-47df8f473d86',reportId:'0b179c11-88b1-4102-9997-3a1f591f3c49',requestId:'c2c2537c-64b7-4c83-abb5-daa8f1606cb7',snapshotId:'8c6b131c-c674-48bf-85da-d7cdb34ef770',name:'[harness-test] Large retained capture mtpcjtmw'};
export function checkedJob(job){assert.ok(job&&typeof job==='object');assert.equal(job.id,retained.jobId);assert.equal(job.requestId,retained.requestId);assert.equal(job.reportId,retained.reportId);assert.ok(Number.isSafeInteger(job.checkpoint)&&job.checkpoint>=56);assert.ok(['active','complete','cancelled','failed'].includes(job.state));return job;}
export function classifyAdvance(wire){
 if(wire?.httpStatus!==200||wire?.outerSuccess!==true||!wire?.body||typeof wire.body.success!=='boolean')return 'unknown';
 if(!wire.body.success)return 'refused';
 const job=checkedJob(wire.body.job);assert.equal(job.checkpoint,57,'Exactly one advance may acknowledge exactly one new checkpoint');assert.ok(['active','complete','failed'].includes(job.state));return job.state==='complete'?'published':job.state==='failed'?'failed':'advanced';
}
export function admitCleanup(journal,digest,expectedDigest,now){
 assert.match(expectedDigest||'',/^[a-f0-9]{64}$/);assert.equal(digest,expectedDigest);assert.deepEqual(journal.retained,retained);assert.equal(journal.phase,'advance');assert.equal(journal.sourceAndPreferencesPreserved,true);assert.equal(journal.advanceCalls,1);
 assert.ok(Number.isSafeInteger(journal.lastWriteReturnedMs)&&journal.lastWriteReturnedMs>0);assert.ok(now>=journal.lastWriteReturnedMs+120000,'The last observed write may still own its 120-second lease');
 const job=checkedJob(journal.finalJob);assert.notEqual(job.state,'complete','Published report must be read/exported and separately reviewed, never deleted by staging recovery');assert.equal(journal.publicationObserved,false);assert.ok(journal.finalProbe);assert.equal(journal.finalProbe.publicArtifacts.length,0);return job;
}
