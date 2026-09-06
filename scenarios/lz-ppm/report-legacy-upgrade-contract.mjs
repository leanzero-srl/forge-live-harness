import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const legacyPrincipal='b4cb5211a5e4d44c9f3a6bc909588c2fe62162358d4b0c04da52aa6977433769';
export function admitLegacyReceipt(prepared,currentJob,currentPlanId,receipt){
 assert.equal(prepared.phase,'prepare');assert.equal(prepared.completed,true);assert.equal(prepared.integrityPreserved,true);assert.match(prepared.deployedForge,/^\d+\.\d+\.\d+$/);assert.equal(prepared.deployedApp,'e8d46785d8cda3d2b3680b0e84e52dbd7c1a68ee');
 assert.equal(receipt.mode,'portable-chrome152');assert.equal(receipt.principalSha256,legacyPrincipal);assert.equal(prepared.receipt.principalSha256,legacyPrincipal);assert.equal(prepared.planId,currentPlanId);assert.ok(prepared.issue?.id&&prepared.issue?.key);assert.ok(prepared.pausedJob);assert.deepEqual(currentJob,prepared.pausedJob);assert.ok(typeof currentJob.reportId==='string'&&currentJob.reportId);assert.equal(currentJob.state,'active');assert.equal(currentJob.cleanupDone,false);assert.equal(currentJob.stageLabel,'Calculating the forecast');assert.equal(prepared.noAdvanceWhilePaused,true);assert.ok(prepared.pausedProbe.privateArtifacts.length);assert.deepEqual(prepared.pausedProbe.publicArtifacts,[]);return currentJob;
}
export function assertLegacyExpansion(before,after){
 assert.ok(after.privateArtifacts.length>before.privateArtifacts.length,'Conversion must retain legacy values and register new encoded values');const byHash=new Map(after.privateArtifacts.map(v=>[v.keyHash,v]));assert.equal(byHash.size,after.privateArtifacts.length);for(const old of before.privateArtifacts){assert.deepEqual(byHash.get(old.keyHash),old,'Legacy physical artifact was changed or removed during conversion');assert.equal(old.present,true);}assert.deepEqual(after.publicArtifacts,[]);
}

/** Independent exact input oracle for this one admitted five-day leaf, not a general hydration replica. */
export function legacyForecastInput(plan,calendar){
 assert.equal(plan.issues.length,1);assert.deepEqual(plan.meta.milestones||[],[]);
 assert.deepEqual(calendar,{workingDays:[1,2,3,4,5],holidays:[],calendarName:'Standard (Mon-Fri)'});
 const row=structuredClone(plan.issues[0]);assert.equal(row.startDate,'2026-10-05');assert.equal(row.dueDate,'2026-10-09');assert.equal(row.duration,5);assert.equal(row.parentKey??null,null);assert.deepEqual(row.predecessors||[],[]);assert.deepEqual(row.successors||[],[]);assert.deepEqual(row.children||[],[]);
 // The fixture is exactly five weekdays; its admitted current and Jira baseline are both five.
 if(row._original){assert.equal(row._original.duration,5);assert.ok(row._original.startDate===undefined||row._original.startDate==='2026-10-05');assert.ok(row._original.dueDate===undefined||row._original.dueDate==='2026-10-09');}
 delete row.fieldAvail;delete row.predecessorLags;
 const input={issues:[row],calendar,targets:[],uncertainty:'medium'};
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return {input,inputHash:createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex')};
}

/** Only the acknowledged exact cleanup receipt licenses read-only reuse of this fixture. */
export function admitLegacyReuse(recovered,receipt){
 assert.equal(recovered.phase,'recover');assert.equal(recovered.completed,true);assert.equal(recovered.integrityPreserved,true);assert.equal(recovered.oldPlanDeleted,true);assert.equal(recovered.issueRetained,true);assert.equal(recovered.receipt.principalSha256,legacyPrincipal);assert.equal(receipt.principalSha256,legacyPrincipal);
 const original=recovered.originalPrepare;assert.equal(original.planId,'plan-test-mtpemgwx-gwhiv5');assert.deepEqual(original.issue,{id:'25167',key:'WFH-2935'});assert.equal(original.completed,true);assert.equal(original.integrityPreserved,true);
 assert.equal(recovered.cleaned.cleaned,true);assert.equal(recovered.cleaned.job.id,original.pausedJob.id);assert.equal(recovered.cleaned.job.requestId,original.pausedJob.requestId);assert.equal(recovered.cleaned.job.state,'cancelled');assert.equal(recovered.cleaned.job.cleanupDone,true);
 assert.ok(recovered.cleaned.probes.length>=2);for(const proof of recovered.cleaned.probes.slice(-2)){assert.equal(proof.jobId,original.pausedJob.id);assert.equal(proof.state,'cancelled');assert.equal(proof.cleanupDone,true);assert.deepEqual(proof.privateArtifacts.map(v=>[v.keyHash,v.expectedHash]),original.pausedProbe.privateArtifacts.map(v=>[v.keyHash,v.expectedHash]));assert.ok(proof.privateArtifacts.every(v=>v.present===false&&v.actualHash===null));assert.deepEqual(proof.publicArtifacts,[]);}
 return original;
}
