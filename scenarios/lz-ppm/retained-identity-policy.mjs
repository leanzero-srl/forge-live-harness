import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const retainedPlanNames={main:'[harness-test] UAT 20260906 October release decisions',mirror:'[harness-test] UAT 20260906 October capacity mirror'};
const summaries={E:'October release',A:'Delivery preparation',B:'Planned reserve',L:'Unrelated late work'};
const sorted=values=>[...values].sort();
const unique=values=>new Set(values).size===values.length;

// A single explicit UAT retention contract; not a generic registry exemption.
// The normal identity guard still proves the rendered stamp and original45.
export function retainedIdentityPolicy({ledger,beforeBytes,runId,unitDir,ledgerPath,actualLedgerPath,plans,details,actualCapacitySettings,actualDrafts}) {
  assert.equal(path.resolve(ledgerPath),path.join(path.resolve(unitDir),'retained-uat-ledger.json'),'Ledger must belong to this exact attempt');
  assert.equal(actualLedgerPath,path.resolve(ledgerPath),'Symlinked ledger/ancestor must not escape the attempt');
  const before=JSON.parse(beforeBytes);
  assert.equal(ledger.schema,1);assert.equal(ledger.state,'retained');
  assert.equal(ledger.runId,runId);assert.ok(typeof runId==='string'&&runId.length>0);
  assert.equal(ledger.unitDir,path.resolve(unitDir));
  assert.equal(ledger.beforeIdentitySha256,createHash('sha256').update(beforeBytes).digest('hex'));
  assert.equal(ledger.observedUiVersion,before.uiVersion);
  assert.equal(ledger.privateSettingsRestored,true);assert.equal(ledger.noPendingDrafts,true);
  for(const field of ['failure','settingsRestorationFailure','browserCrash'])assert.ok(!ledger[field],`Retained ledger has ${field}`);
  assert.ok(Array.isArray(ledger.cleanup)&&ledger.cleanup.every(row=>row.ok===true),'Every terminal cleanup/retention guard must pass');
  for(const name of ['owned source and standing schedule unchanged','registry exact retained delta','standing schedule unchanged'])assert.equal(ledger.cleanup.filter(row=>row.name===name&&row.ok===true).length,1);
  assert.ok(ledger.originalPrivateSettings&&typeof ledger.originalPrivateSettings==='object');assert.deepEqual(actualCapacitySettings,ledger.originalPrivateSettings,'Fresh current-user settings must equal the original');
  assert.ok(Number.isFinite(Date.parse(ledger.startedAt))&&Number.isFinite(Date.parse(ledger.finishedAt)));
  assert.ok(Date.parse(ledger.startedAt)>=Date.parse(before.time)&&Date.parse(ledger.finishedAt)>=Date.parse(ledger.startedAt));
  assert.ok(Array.isArray(before.planIds)&&unique(before.planIds));assert.deepEqual(sorted(ledger.registry),sorted(before.planIds));
  assert.deepEqual(Object.keys(ledger.plans).sort(),['main','mirror']);
  assert.deepEqual(Object.keys(ledger.issues).sort(),['A','B','E','L']);
  const ownedPlans=Object.entries(retainedPlanNames).map(([role,name])=>{
    const item=ledger.plans[role];assert.equal(item.state,'created');assert.equal(item.name,name);assert.ok(typeof item.id==='string'&&item.id.startsWith('plan-'));
    assert.ok(!before.planIds.includes(item.id),'A retained plan must be new to this attempt');
    const actual=plans.filter(plan=>plan.id===item.id);assert.equal(actual.length,1);assert.equal(actual[0].name,name);return item.id;
  });
  assert.ok(unique(ownedPlans));
  const expected=sorted([...before.planIds,...ownedPlans]);assert.deepEqual(sorted(plans.map(plan=>plan.id)),expected,'Only the two exact retained plans may be added');
  const issues=Object.entries(summaries).map(([role,summary])=>{
    const item=ledger.issues[role];assert.equal(item.state,'created');assert.match(item.id,/^\d+$/);assert.match(item.key,/^WFH-\d+$/);
    assert.equal(item.summary,`[harness-test] LZ retained UAT 20260906 ${summary}`);assert.equal(item.type,role==='E'?'10000':'10004');return item;
  });
  assert.ok(unique(issues.map(i=>i.id))&&unique(issues.map(i=>i.key)));
  assert.ok(ledger.handoff?.baselineId&&ledger.handoff?.originalId&&ledger.handoff?.alternativeId&&ledger.handoff?.reportId,'Retained decisions and report must be recorded');
  assert.match(ledger.handoff.reportHtmlHash,/^[a-f0-9]{64}$/);
  assert.equal(details.length,2);
  assert.deepEqual(actualDrafts.map(item=>item.planId).sort(),sorted(ownedPlans));
  for(const item of actualDrafts){assert.equal(item.draft,null);assert.deepEqual(item.drafts,{});}
  for(const planId of ownedPlans){
    const matching=details.filter(detail=>detail.meta?.id===planId);assert.equal(matching.length,1);const detail=matching[0];
    assert.equal(detail.meta.name,plans.find(p=>p.id===planId).name);assert.notEqual(detail.meta.mode,'simulation');assert.equal(detail.meta.status,'indexed');assert.equal(detail.meta.issueCount,4);
    assert.equal(detail.issues.length,4);assert.deepEqual(sorted(detail.issues.map(i=>i.key)),sorted(issues.map(i=>i.key)));
    for(const expectedIssue of issues){const row=detail.issues.find(i=>i.key===expectedIssue.key);assert.equal(String(row.id),expectedIssue.id);assert.equal(row.summary,expectedIssue.summary);}
  }
  return {planIds:expected,retainedPlanIds:ownedPlans,retainedIssueKeys:issues.map(i=>i.key),ledgerHash:createHash('sha256').update(JSON.stringify(ledger)).digest('hex')};
}
