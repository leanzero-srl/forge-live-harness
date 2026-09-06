import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {UI_READS} from './seventeenth-forecast-resume-contract.mjs';
import {verifyCaptureProbe} from './report-capture-cleanup.mjs';
const pinPath=new URL('../../tests/eighteenth-recovery/pinned.json',import.meta.url);
export const pinned=JSON.parse(fs.readFileSync(pinPath));
export const sha=x=>createHash('sha256').update(x).digest('hex');
const sort=xs=>[...xs].sort();
export function recoveryAdmission(env=process.env){
 const phase=env.LZ_EIGHTEENTH_RECOVERY_PHASE;if(phase==null||phase==='')return null;
 assert.equal(phase,'approved-three-fixtures');
 for(const key of ['LZ_EIGHTEENTH_RECOVERY_EVIDENCE','LZ_EIGHTEENTH_RECOVERY_APPROVAL','LZ_EIGHTEENTH_RECOVERY_APPROVAL_SHA256'])assert.ok(env[key],`${key} required before registration`);
 const root=path.resolve(env.LZ_EIGHTEENTH_RECOVERY_EVIDENCE),bytes=fs.readFileSync(path.join(root,'terminal-recovery-receipt.json'));
 assert.equal(sha(bytes),pinned.terminalSha256);const terminal=JSON.parse(bytes);assert.equal(terminal.runnerState.status,'integrity_failed');assert.deepEqual(terminal.businessCases,{passed:1,failed:3,notRun:3});
 assert.equal(sha(fs.readFileSync(path.join(root,'summary.json'))),pinned.summarySha256);
 for(const f of pinned.fixtures)for(const e of f.evidence)assert.equal(sha(fs.readFileSync(path.join(root,e.path))),e.sha256);
 const approvalBytes=fs.readFileSync(env.LZ_EIGHTEENTH_RECOVERY_APPROVAL);assert.match(env.LZ_EIGHTEENTH_RECOVERY_APPROVAL_SHA256,/^[a-f0-9]{64}$/);assert.equal(sha(approvalBytes),env.LZ_EIGHTEENTH_RECOVERY_APPROVAL_SHA256);
 const approval=JSON.parse(approvalBytes);assert.equal(approval.schema,'eighteenth-root-recovery-approval-v1');assert.equal(approval.approveRecovery,true);assert.equal(approval.terminalSha256,pinned.terminalSha256);assert.equal(approval.pinSha256,sha(fs.readFileSync(pinPath)));assert.equal(approval.principal,pinned.principal);assert.deepEqual(approval.planIds,pinned.fixtures.map(f=>f.planId));assert.deepEqual(approval.issueKeys,pinned.fixtures.map(f=>f.issue));assert.deepEqual(approval.jobIds,pinned.fixtures.map(f=>f.job.id));assert.match(approval.rootDispatchCommit||'',/^[a-f0-9]{40}$/);
 return {approval,approvalSha256:sha(approvalBytes),terminalSha256:pinned.terminalSha256,pinSha256:sha(fs.readFileSync(pinPath))};
}
export function verifyOwnedSource(value,f){
 assert.equal(value.meta?.id,f.planId);assert.equal(value.meta.name,f.name);assert.equal(value.meta.createdBy,'harness');assert.equal(value.meta.mode,undefined);assert.equal(value.meta.calendarKey,'standard');
 assert.deepEqual(value.meta.sources,[{id:'src-0',type:'jql',label:'harness',query:`key in (${f.issue}) ORDER BY Rank ASC`,boardId:null,projectKey:null}]);
 assert.equal(value.issues.length,1);const row=value.issues[0];assert.equal(row.key,f.issue);assert.equal(row.summary,`${f.name} ${f.seed.label}`);assert.equal(row.startDate,f.seed.start);assert.equal(row.dueDate,f.seed.due);assert.equal(row.duration,f.seed.duration);assert.deepEqual(row.predecessors||[],[]);assert.deepEqual(row.successors||[],[]);assert.equal(row.parentKey??null,null);return value;
}
export function verifyOwnedJira(result,f){
 assert.equal(result.httpStatus,200,'Same exact issue must be positively readable before DELETE');const issue=result.body;assert.equal(issue.key,f.issue);assert.match(issue.id||'',/^\d+$/);assert.equal(issue.fields.project.key,'WFH');assert.equal(issue.fields.issuetype.id,'10004');assert.deepEqual(issue.fields.labels,[f.marker]);assert.equal(issue.fields.summary,`${f.name} ${f.seed.label}`);for(const field of ['customfield_10015','duedate','customfield_10180'])assert.ok(Object.hasOwn(issue.fields,field));assert.equal(issue.fields.customfield_10015,f.seed.start);assert.equal(issue.fields.duedate,f.seed.due);assert.equal(issue.fields.customfield_10180,f.seed.duration);assert.deepEqual(issue.fields.issuelinks,[]);assert.equal(issue.fields.parent,undefined);return result;
}
export function recoveryUiClass(call,armed){
 if(!call)return 'unrelated';
 if(call.functionKey==='deletePlan')return armed&&JSON.stringify(call.payload)===JSON.stringify({planId:armed})?'approved-plan-delete':'forbidden';
 const reads=new Set(UI_READS);
 if(!reads.has(call.functionKey))return 'forbidden';
 if(call.payload?.planId&&!pinned.originals.includes(call.payload.planId)&&!pinned.fixtures.some(f=>f.planId===call.payload.planId))return 'forbidden';return 'read';
}
/** Strict finite cleanup. Every mutator is called once, never retried. Full admission of all
 * fixtures precedes the first mutation. Checkpoint drift refuses, including benign drift.
 * A new externally reviewed receipt is required after any partial/unknown outcome. */
export async function recoverThree({approval,io,record=(_stage,_value)=>{}}){
 assert.ok(approval?.approval?.approveRecovery);assert.equal(approval.terminalSha256,pinned.terminalSha256);
 const removed=[],sources=new Map(),issues=new Map();const ids=()=>sort([...pinned.originals,...pinned.fixtures.map(f=>f.planId).filter(id=>!removed.includes(id))]);
 const registry=async()=>{const r=await io.registry();assert.deepEqual(sort(r.map(p=>p.id)),ids());return r;};
 const originalRegistry=(await registry()).filter(p=>pinned.originals.includes(p.id));
 const otherStanding=await io.otherSources();
 const standing=await io.originalSource(); // Adapter verifies pinned full 45-row fingerprint.
 const guard=async()=>{assert.equal(await io.principal(),pinned.principal);assert.deepEqual(await io.preferences(),pinned.preferences);assert.deepEqual(await io.originalSource(),standing);const r=await registry();assert.deepEqual(r.filter(p=>pinned.originals.includes(p.id)),originalRegistry);for(const id of pinned.originals)await io.emptyDrafts(id);};
 await guard();
 for(const f of pinned.fixtures){
  sources.set(f.planId,verifyOwnedSource(await io.source(f.planId),f));issues.set(f.issue,verifyOwnedJira(await io.issue('GET',f.issue),f));assert.equal(String(sources.get(f.planId).issues[0].id),issues.get(f.issue).body.id);
  await io.emptyDrafts(f.planId);assert.deepEqual(await io.baseline(f.planId),{baseline:null});assert.deepEqual(await io.reports(f.planId),{success:true,entries:[],nextCursor:null});assert.deepEqual(await io.job(f),{success:true,job:f.job});
  const probe=await io.probe(f);verifyCaptureProbe(probe,{planId:f.planId,jobId:f.job.id,...f.job});assert.deepEqual(probe,f.probe);assert.equal(probe.publicArtifacts.length,0);await record('admitted-fixture',{planId:f.planId,job:f.job,probe});
 }
 // Private payload cleanup for all three before any plan or Jira deletion.
 for(const f of pinned.fixtures){
  await guard();assert.deepEqual(await io.source(f.planId),sources.get(f.planId));assert.deepEqual(await io.job(f),{success:true,job:f.job});let job=f.job;
  if(!job.cleanupDone){assert.equal(job.state,'active');assert.equal(job.checkpoint,1);const r=await io.cancel(f);await record('owner-cancel-ack',{planId:f.planId,result:r});assert.equal(r.success,true);const next=r.job;assert.deepEqual(next,{...job,state:'cancelled',stageLabel:'Cleaning up temporary data',checkpoint:2,completedUnits:2,cleanupDone:true});job=next;}
  for(let n=0;n<2;n++){const p=await io.probe(f);verifyCaptureProbe(p,{planId:f.planId,jobId:f.job.id,...job},f.probe);assert.equal(p.publicArtifacts.length,0);assert.ok(p.privateArtifacts.every(a=>!a.present));await record('payloads-absent-before-plan-delete',{planId:f.planId,probe:p});}
  assert.deepEqual(await io.job(f),{success:true,job});
 }
 for(const f of pinned.fixtures){
  await guard();assert.deepEqual(await io.source(f.planId),sources.get(f.planId));assert.deepEqual(verifyOwnedJira(await io.issue('GET',f.issue),f),issues.get(f.issue));
  await io.emptyDrafts(f.planId);assert.deepEqual(await io.baseline(f.planId),{baseline:null});assert.deepEqual(await io.reports(f.planId),{success:true,entries:[],nextCursor:null});
  // Fresh strong absence immediately before the one normal owner plan delete.
  const p=await io.probe(f);verifyCaptureProbe(p,{planId:f.planId,jobId:f.job.id,state:'cancelled',checkpoint:2,cleanupDone:true},f.probe);assert.ok([...p.privateArtifacts,...p.publicArtifacts].every(a=>!a.present));
  assert.deepEqual(await io.deletePlan(f),{success:true});removed.push(f.planId);await record('plan-delete-ack',{planId:f.planId});
  for(let n=0;n<2;n++){const absent=await io.source(f.planId);assert.equal(absent.meta??null,null);assert.deepEqual(absent.issues,[]);await registry();}
  // Positive control is this exact issue, immediately before its single DELETE.
  assert.equal(await io.principal(),pinned.principal);assert.deepEqual(verifyOwnedJira(await io.issue('GET',f.issue),f),issues.get(f.issue));
  const gone=await io.issue('DELETE',f.issue);assert.equal(gone.httpStatus,204);await record('issue-delete-ack',{key:f.issue,...gone});for(let n=0;n<2;n++)assert.equal((await io.issue('GET',f.issue)).httpStatus,404);await guard();
 }
 await guard();assert.deepEqual(await io.otherSources(),otherStanding);await record('recovery-complete',{planIds:removed,issueKeys:pinned.fixtures.map(f=>f.issue),privatePayloadAbsence:'strongly verified before plan deletion',catalogPhysicalAbsence:'not independently observable after plan removal through existing guarded hook'});return {completed:true,planIds:removed,issueKeys:pinned.fixtures.map(f=>f.issue)};
}
