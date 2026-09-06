import assert from 'node:assert/strict';
export const retained={planId:'plan-test-mtpfsb3x-zok6h0',jobId:'1d7c9d10-c4d9-488e-bc78-d148e64075ad',reportId:'841762d5-8a74-4458-afbc-1fc3519a45d8',requestId:'bb51b679-2302-4cb2-a149-9a157cbb259a',snapshotId:'65e9f6e7-2c73-4099-9f83-1009da7e0c2e',name:'[harness-test] Large retained capture mtpfsaep'};
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
