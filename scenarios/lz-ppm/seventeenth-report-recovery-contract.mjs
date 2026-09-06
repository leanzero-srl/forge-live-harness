import assert from 'node:assert/strict';
export const retained={planId:'plan-test-mtpjc7v3-o83uav',jobId:'b9a0dc2b-53cd-4caf-8f20-dafbb066ac98',reportId:'05526885-ecea-499a-ba38-9479d7ae8b16',requestId:'2d8c3fef-b28e-45a5-b4bc-06755e609e03',snapshotId:'5f241094-c7e5-48a5-bc51-5de4f19dcd7b',name:'[harness-test] Large retained capture mtpjc76h'};
export function checkedJob(job){assert.ok(job&&typeof job==='object');assert.equal(job.id,retained.jobId);assert.equal(job.requestId,retained.requestId);assert.equal(job.reportId,retained.reportId);assert.ok(Number.isSafeInteger(job.checkpoint)&&job.checkpoint>=78);assert.ok(['active','complete','cancelled','failed'].includes(job.state));return job;}
export function classifyAdvance(wire){
 if(wire?.httpStatus!==200||wire?.outerSuccess!==true||!wire?.body||typeof wire.body.success!=='boolean')return 'unknown';
 if(!wire.body.success)return 'refused';
 const job=checkedJob(wire.body.job);assert.equal(job.checkpoint,79,'Exactly one advance may acknowledge exactly one new checkpoint');assert.ok(['active','complete','failed'].includes(job.state));return job.state==='complete'?'published':job.state==='failed'?'failed':'advanced';
}
export function admitCleanup(journal,digest,expectedDigest,now){
 assert.match(expectedDigest||'',/^[a-f0-9]{64}$/);assert.equal(digest,expectedDigest);assert.deepEqual(journal.retained,retained);assert.equal(journal.phase,'advance');assert.equal(journal.sourceAndPreferencesPreserved,true);assert.equal(journal.advanceCalls,1);
 assert.ok(Number.isSafeInteger(journal.lastWriteReturnedMs)&&journal.lastWriteReturnedMs>0);assert.ok(now>=journal.lastWriteReturnedMs+120000,'The last observed write may still own its 120-second lease');
 const job=checkedJob(journal.finalJob);assert.notEqual(job.state,'complete','Published report must be read/exported and separately reviewed, never deleted by staging recovery');assert.equal(journal.publicationObserved,false);assert.ok(journal.finalProbe);assert.equal(journal.finalProbe.publicArtifacts.length,0);return job;
}
