import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {admitPrivateSource,verifyPrivateSnapshot,admitPrivateFork,privateReportOracle,privateAccount} from './private-report-witness-contract.mjs';
export const retainedPins=Object.freeze({journalSha256:'8945bf1bdbcda9834da1c3d8940d32ed53ee8e635da1d792fb56890aff4077dc',terminalSha256:'b98fa29d7f564cacd251ecb472ff28dce552c4afe487f04b2da409150dad7bcf',sourcePlanId:'plan-test-mtq429na-ycwarn',privatePlanId:'sim-bb5ccf50-eec6-4ea2-8315-bd69b3dc604d',reportId:'7fb0d2d8-37f9-461e-910a-406246a5d46b',jobId:'de0cf61c-7c83-4a5b-8fbc-79eca19506fe',checkpoint:41});
export const originalPlans=Object.freeze(['plan-msq9dg8l-gz6mz1','plan-mta3aw3t-6dyijd','plan-mtbrlh8n-7ghw8u']);
export const shaBytes=bytes=>createHash('sha256').update(bytes).digest('hex');
export function retainedPhase(value){if(value===undefined||value==='')return false;assert.equal(value,'reopen-cleanup');return true;}
export function validateRetainedState(j){
 assert.equal(j.phase,'owner');assert.equal(j.completed,false);assert.equal(j.state,'recovery-required');assert.equal(j.integrityPreserved,true);assert.equal(j.jiraWrites,0);assert.equal(j.physicalKvsVerified,false);assert.equal(j.secondPrincipalVerified,false);
 assert.deepEqual(j.owned,{sourcePlanId:retainedPins.sourcePlanId,privatePlanId:retainedPins.privatePlanId});assert.equal(j.observedPrivatePlanId,retainedPins.privatePlanId);for(const key of ['reportDeleted','sourceDeleted','privateDeleted','publicAbsenceTwice'])assert.equal(j[key],undefined);
 admitPrivateSource(j.source,j.sourceName);verifyPrivateSnapshot(j.snapshot,j.source,j.snapshot.calendar,j.snapshot.name);
 const inputs={ack:j.fork,source:j.source,snapshot:j.snapshot,name:j.privateName,planRead:{success:true,plan:j.owner.plan},modelRead:j.owner.modelRead};assert.deepEqual(admitPrivateFork(inputs),j.owner);assert.equal(j.owner.planId,retainedPins.privatePlanId);
 assert.equal(j.report.id,retainedPins.reportId);assert.equal(j.finalJob.id,retainedPins.jobId);assert.equal(j.finalJob.checkpoint,41);assert.deepEqual(j.finalJob,j.protocol.job);assert.equal(j.finalJob.cleanupDone,true);assert.equal(j.finalJob.state,'complete');assert.equal(j.finalJob.reportId,j.report.id);
 assert.deepEqual(j.settings,{success:true,version:68,settings:{selectedPlanIds:[],profiles:{},issueChoices:{}}});
 assert.deepEqual(privateReportOracle({owner:j.owner,job:j.finalJob,summary:j.report,name:j.finalJob.name,captureWindow:j.captureWindow}),j.expected);
 return inputs;
}
export function admitRetainedBytes(journalBytes,terminalBytes){
 assert.equal(shaBytes(journalBytes),retainedPins.journalSha256);assert.equal(shaBytes(terminalBytes),retainedPins.terminalSha256);const j=JSON.parse(journalBytes.toString()),t=JSON.parse(terminalBytes.toString());assert.equal(t.status,'closed');assert.deepEqual(t.alivePids,[]);assert.equal(t.journal.sha256,retainedPins.journalSha256);assert.equal(t.overallPassed,false);assert.deepEqual(t.owned,j.owned);validateRetainedState(j);return j;
}
export function verifyRetainedFresh(j,f){
 assert.deepEqual(Object.keys(f).sort(),['drafts','issueFirst','issueSecond','modelRead','planRead','principal','registry','settings','snapshot','source','standing'].sort());assert.equal(f.principal,privateAccount);assert.deepEqual(f.source,j.source);assert.deepEqual(f.snapshot,j.snapshot);assert.deepEqual(f.planRead,{success:true,plan:j.owner.plan});assert.deepEqual(f.modelRead,j.owner.modelRead);assert.deepEqual(f.settings,j.settings);
 const initialStanding=j.events.find(e=>e.stage==='private-hook'&&e.value.query.what==='plan'&&e.value.query.planId===originalPlans[0]).value.result;assert.deepEqual(f.standing,initialStanding);
 const initialIssue=j.events.find(e=>e.stage==='shared-issue-get-only').value;assert.deepEqual(f.issueFirst,initialIssue);assert.deepEqual(f.issueSecond,initialIssue);
 assert.deepEqual([...f.registry].sort(),[...originalPlans,retainedPins.sourcePlanId,retainedPins.privatePlanId].sort());
 const all=[...originalPlans,retainedPins.sourcePlanId,retainedPins.privatePlanId];assert.deepEqual(Object.keys(f.drafts).sort(),all.sort());for(const value of Object.values(f.drafts))assert.deepEqual(value,{draft:{success:true,draft:null},active:{success:true,drafts:{}}});
 const inputs={ack:j.fork,source:f.source,snapshot:f.snapshot,name:j.privateName,planRead:f.planRead,modelRead:f.modelRead};assert.deepEqual(admitPrivateFork(inputs),j.owner);return inputs;
}
export function requireCleanupAuthority(j,{fresh,owner,summary,job,pages,html,reopenedHtml}){
 verifyRetainedFresh(j,fresh);assert.deepEqual(owner,j.owner);assert.deepEqual(summary,j.report);assert.deepEqual(job,j.finalJob);assert.deepEqual(pages,j.expected.pages);assert.equal(html,j.expected.html);assert.equal(reopenedHtml,j.expected.html);return true;
}
