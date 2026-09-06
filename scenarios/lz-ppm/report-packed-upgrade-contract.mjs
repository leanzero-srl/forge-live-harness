import assert from 'node:assert/strict';
/** Exact measured shared fixture admission; it is never owned for mutation by this journey. */
export function admitPackedFixture(value,expected){
 assert.equal(expected?.id,'25020');assert.equal(expected?.key,'WFH-2820');assert.equal(expected.fields.project.id,'10001');assert.equal(expected.fields.project.key,'WFH');assert.equal(expected.fields.issuetype.id,'10004');assert.equal(expected.fields.summary,'[harness-test] LZ Assets owned 20260905 WFH positive control');assert.deepEqual(expected.fields.description,{type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text:'lz-assets-owned-20260905-wfh'}]}]});assert.equal(expected.fields.customfield_10015,'2026-10-05');assert.equal(expected.fields.duedate,'2026-10-09');assert.equal(expected.fields.customfield_10180,5);assert.deepEqual(value,expected);return value;
}

import {createHash} from 'node:crypto';
export const encodedArtifactNames=['source-context','raw-0-0-0','current-0-0'];
export const artifactIdentity=(planId,jobId,name)=>createHash('sha256').update(JSON.stringify(`p:${planId}:report-jobs:data:${jobId}:${name}`)).digest('hex');
/** Exact old6.17 layout, not a positive artifact count or a legacy/raw/packed substitute. */
export function assertOldEncodedLayout(probe,planId,jobId){
 assert.equal(probe.planId,planId);assert.equal(probe.jobId,jobId);assert.equal(probe.state,'active');assert.equal(probe.cleanupDone,false);
 assert.deepEqual(probe.privateArtifacts.map(v=>v.keyHash).sort(),encodedArtifactNames.map(name=>artifactIdentity(planId,jobId,name)).sort());
 for(const value of probe.privateArtifacts){assert.equal(value.present,true);assert.match(value.expectedHash,/^[a-f0-9]{64}$/);assert.equal(value.actualHash,value.expectedHash);}
 assert.deepEqual(probe.publicArtifacts,[]);return probe;
}

export function admitPackedReceipt(prepared,currentJob,currentPlanId,receipt){
 assert.equal(prepared.phase,'prepare');assert.equal(prepared.completed,true);assert.equal(prepared.integrityPreserved,true);assert.equal(prepared.deployedForge,'6.17.0');assert.equal(prepared.deployedApp,'34372ae3f9cb12b1ff94a58dbda313a6deab6f03');assert.equal(prepared.jiraWrites,0);assert.equal(prepared.noAdvanceWhilePaused,true);
 const principal='b4cb5211a5e4d44c9f3a6bc909588c2fe62162358d4b0c04da52aa6977433769';assert.equal(prepared.receipt.principalSha256,principal);assert.equal(receipt.principalSha256,principal);assert.equal(receipt.mode,'portable-chrome152');
 assert.equal(currentPlanId,prepared.planId);assert.deepEqual(prepared.issue,{id:'25020',key:'WFH-2820'});admitPackedFixture(prepared.originalIssue,prepared.originalIssue);assert.deepEqual(currentJob,prepared.pausedJob);assert.equal(currentJob.stageLabel,'Calculating the forecast');assert.equal(currentJob.checkpoint,4);assert.equal(currentJob.state,'active');assert.equal(currentJob.cleanupDone,false);assert.ok(currentJob.reportId);assert.equal(prepared.oldProducerForecast.inputHash,prepared.expectedInput.inputHash);assertOldEncodedLayout(prepared.pausedProbe,currentPlanId,currentJob.id);return currentJob;
}
export function assertPackedExpansion(before,after,planId,jobId){
 assertOldEncodedLayout(before,planId,jobId);assert.equal(after.planId,planId);assert.equal(after.jobId,jobId);assert.equal(after.state,'active');assert.equal(after.cleanupDone,false);assert.deepEqual(after.publicArtifacts,[]);
 const expected=[...before.privateArtifacts.map(v=>v.keyHash),...['pack-raw-0-0','pack-current-0-0'].map(name=>artifactIdentity(planId,jobId,name))].sort();assert.deepEqual(after.privateArtifacts.map(v=>v.keyHash).sort(),expected);
 const byKey=new Map(after.privateArtifacts.map(v=>[v.keyHash,v]));for(const old of before.privateArtifacts)assert.deepEqual(byKey.get(old.keyHash),old,'Original encoded artifact changed during packing');for(const value of after.privateArtifacts){assert.equal(value.present,true);assert.match(value.expectedHash,/^[a-f0-9]{64}$/);assert.equal(value.actualHash,value.expectedHash);}return after;
}
