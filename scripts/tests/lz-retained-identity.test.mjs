import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retainedIdentityPolicy} from '../../scenarios/lz-ppm/retained-identity-policy.mjs';

function valid(){
 const before={time:'2026-09-06T00:00:00Z',uiVersion:'4.58.578',planIds:['plan-original-a','plan-original-b','plan-original-c']},beforeBytes=JSON.stringify(before)+'\n';
 const plans=[...before.planIds.map(id=>({id,name:id})),{id:'plan-owned-main',name:'[harness-test] UAT 20260906 October release decisions'},{id:'plan-owned-mirror',name:'[harness-test] UAT 20260906 October capacity mirror'}];
 const issues=Object.fromEntries(['E','A','B','L'].map((role,n)=>[role,{id:String(900+n),key:`WFH-${900+n}`,summary:'[harness-test] LZ retained UAT 20260906 '+['October release','Delivery preparation','Planned reserve','Unrelated late work'][n],type:role==='E'?'10000':'10004',state:'created'}]));
 const ledger={schema:1,state:'retained',runId:'uat-run',unitDir:'/tmp/uat-attempt',beforeIdentitySha256:createHash('sha256').update(beforeBytes).digest('hex'),observedUiVersion:before.uiVersion,privateSettingsRestored:true,noPendingDrafts:true,cleanup:['owned source and standing schedule unchanged','registry exact retained delta','standing schedule unchanged'].map(name=>({name,ok:true})),startedAt:'2026-09-06T00:01:00Z',finishedAt:'2026-09-06T00:02:00Z',registry:before.planIds,plans:{main:{...plans[3],state:'created'},mirror:{...plans[4],state:'created'}},originalPrivateSettings:{selectedPlanIds:[],profiles:{},issueChoices:{}},issues,handoff:{baselineId:'baseline',originalId:'original',alternativeId:'alternative',reportId:'report',reportHtmlHash:'a'.repeat(64)}};
 const details=plans.slice(3).map(plan=>({meta:{...plan,status:'indexed',issueCount:4},issues:Object.values(issues)}));
 return {ledger,beforeBytes,runId:'uat-run',unitDir:'/tmp/uat-attempt',ledgerPath:'/tmp/uat-attempt/retained-uat-ledger.json',actualLedgerPath:'/tmp/uat-attempt/retained-uat-ledger.json',plans,details,actualCapacitySettings:structuredClone(ledger.originalPrivateSettings),actualDrafts:plans.slice(3).map(p=>({planId:p.id,draft:null,drafts:{}}))};
}
test('exact attempt retains only the two named plans and four real identities',()=>{const p=valid(),result=retainedIdentityPolicy(p);assert.deepEqual(result.retainedPlanIds,['plan-owned-main','plan-owned-mirror']);assert.equal(result.planIds.length,5);assert.equal(result.retainedIssueKeys.length,4);});
for(const [name,alter] of [
 ['missing ledger',p=>delete p.ledger],
 ['symlink escape',p=>p.actualLedgerPath='/tmp/other/retained-uat-ledger.json'],
 ['empty cleanup',p=>p.ledger.cleanup=[]],
 ['failed body',p=>p.ledger.failure='assertion'],
 ['incomplete plan creation',p=>p.ledger.plans.main.state='create-requested'],
 ['incomplete issue creation',p=>p.ledger.issues.A.state='create-requested'],
 ['fresh private settings differ',p=>p.actualCapacitySettings.selectedPlanIds=['plan-foreign']],
 ['actual user draft remains',p=>p.actualDrafts[0].draft={changes:[]}],
 ['actual other-user draft remains',p=>p.actualDrafts[0].drafts={someone:{}}],
 ['ledger from another path',p=>p.ledgerPath='/tmp/other/retained-uat-ledger.json'],
 ['ledger from another run',p=>p.ledger.runId='other'],
 ['ledger from another attempt',p=>p.ledger.unitDir='/tmp/other'],
 ['different before bytes',p=>p.beforeBytes+=' '],
 ['different installed UI',p=>p.ledger.observedUiVersion='4.58.577'],
 ['failed retention state',p=>p.ledger.state='recovery-required'],
 ['settings not restored',p=>p.ledger.privateSettingsRestored=false],
 ['pending draft',p=>p.ledger.noPendingDrafts=false],
 ['failed cleanup',p=>p.ledger.cleanup.push({name:'restore',ok:false})],
 ['preexisting timestamp',p=>p.ledger.startedAt='2026-09-05T00:00:00Z'],
 ['wrong admission registry',p=>p.ledger.registry=['plan-original-a']],
 ['extra third plan',p=>p.plans.push({id:'plan-foreign',name:'other'})],
 ['missing original plan',p=>p.plans.shift()],
 ['duplicate retained plan',p=>p.ledger.plans.mirror={...p.ledger.plans.mirror,id:p.ledger.plans.main.id}],
 ['reused original plan',p=>p.ledger.plans.main.id='plan-original-a'],
 ['renamed retained plan',p=>p.plans[3].name='unrelated'],
 ['foreign issue key',p=>p.ledger.issues.A.key='LZPT-209'],
 ['duplicate issue identity',p=>p.ledger.issues.A.id=p.ledger.issues.E.id],
 ['wrong actual issue identity',p=>p.details[0].issues=p.details[0].issues.map(i=>({...i,id:'123'}))],
 ['unexpected actual member',p=>p.details[0].issues=[...p.details[0].issues,{key:'WFH-999',id:'999'}]],
 ['private model substituted',p=>p.details[0].meta.mode='simulation'],
 ['missing retained report',p=>delete p.ledger.handoff.reportId],
])test(`reject ${name}`,()=>{const input=valid();alter(input);assert.throws(()=>retainedIdentityPolicy(input));});
