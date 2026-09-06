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
