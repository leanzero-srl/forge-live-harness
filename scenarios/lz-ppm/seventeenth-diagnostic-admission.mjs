import assert from 'node:assert/strict';
import {retained,checkedJob} from './seventeenth-report-recovery-contract.mjs';
export function admitPinnedDiagnostic(journal,digest,now,{expectedSha,returnedMs}){
 assert.match(expectedSha,/^[a-f0-9]{64}$/);assert.equal(digest,expectedSha);assert.deepEqual(journal.retained,retained);assert.equal(journal.phase,'advance');assert.equal(journal.advanceCalls,1);assert.equal(journal.sourceAndPreferencesPreserved,true);assert.equal(journal.publicationObserved,false);assert.equal(journal.outcome,'unknown');assert.equal(journal.completed,false);
 assert.equal(journal.lastWriteReturnedMs,returnedMs);assert.ok(Number.isFinite(now)&&now>=journal.lastWriteReturnedMs+120000,'Previous actual write may still hold its120-second lease');
 const job=checkedJob(journal.finalJob);assert.equal(job.state,'active');assert.equal(job.checkpoint,78);assert.equal(job.cleanupDone,false);
 const probe=journal.finalProbe;assert.equal(probe.planId,retained.planId);assert.equal(probe.jobId,retained.jobId);assert.equal(probe.state,'active');assert.equal(probe.checkpoint,78);assert.equal(probe.cleanupDone,false);assert.equal(probe.registryMember,true);assert.equal(probe.privateArtifacts.length,134);assert.equal(new Set(probe.privateArtifacts.map(a=>a.keyHash)).size,134);assert.ok(probe.privateArtifacts.every(a=>a.present===true&&a.expectedHash===a.actualHash));assert.deepEqual(probe.publicArtifacts,[]);assert.deepEqual(probe,journal.probes[0]);
 return {job,probe};
}
