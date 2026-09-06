// LOCAL synthetic identities only. Executes the actual UAT expected-value block
// against real capture projection/forecast/capacity functions; no browser/REST.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {register,createRequire} from 'node:module';
const root=new URL('../../',import.meta.url);
const actualApp=new URL('../lz-ppm-forge/',root);
register(new URL('test/parity/loader.mjs',actualApp));
const require=createRequire(new URL('package.json',root));
const ts=require('typescript');
const {reportIssueRows,reportTargets,reportChanges}=await import(new URL('static/ppm-ui/src/utils/sponsor-report.js',actualApp));
const {reportForecast,reportCapacity}=await import(new URL('src/services/sponsor-report-analytics.mjs',actualApp));
const spec=fs.readFileSync(new URL('scenarios/lz-ppm/journey-campaign-retained-uat.spec.ts',root),'utf8');
const oracle=JSON.parse(fs.readFileSync(new URL('docs/campaign-2026-09/retained-uat-oracle.json',actualApp),'utf8'));
const E='LOCAL-1',A='LOCAL-2',B='LOCAL-3',L='LOCAL-4',profile={hoursPerDay:8,partTimePct:50,reservePct:25,workingDays:[1,2,3,4,5],leaveDates:['2026-10-07']};
const rows=[[E,'Release','2026-10-05','2026-10-16',10,0],[A,'Prepare','2026-10-05','2026-10-09',5,8],[B,'Reserve','2026-10-12','2026-10-16',5,0],[L,'Late','2026-10-26','2026-10-30',5,8]];
const person={accountId:'local-person',displayName:'Local person'};
const admittedJira=rows.map(([key,summary,start,due,duration,hours],n)=>({key,id:String(n+1),fields:{summary,customfield_10015:start,duedate:due,customfield_10180:duration,customfield_10181:{value:'No'},status:{statusCategory:{key:'new'}},assignee:person,timeestimate:hours*3600,...([A,B].includes(key)?{parent:{key:E}}:{})}}));
const f={person,journal:{admittedJira,issues:{E:{id:'1',summary:'Release'}}}},target={id:'local-target'},targetName='UAT October 16 commitment';
const start=spec.indexOf('  const expectedTimeline='),end=spec.indexOf('  const pages:any={};',start);
const bucketStart=spec.indexOf('  const expectedBuckets='),bucketEnd=spec.indexOf('\n',bucketStart);
assert.ok(start>=0&&end>start&&bucketStart>=0);
const block=spec.slice(bucketStart,bucketEnd)+spec.slice(start,end)+'\nglobalThis.result={expectedBuckets,expectedTimeline,expectedTarget,expectedCapacity,expectedAvailability,expectedChanges};';
const scope={f,E,A,B,L,profile,oracle,target,targetName};
vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
const expected=JSON.parse(JSON.stringify(scope.result));
const issues=admittedJira.map(raw=>({id:raw.id,key:raw.key,summary:raw.fields.summary,startDate:raw.fields.customfield_10015,dueDate:raw.fields.duedate,duration:raw.fields.customfield_10180,capturedDuration:true,buffer:raw.key===B?'Yes':'No',statusCategory:'new',parentKey:raw.fields.parent?.key||null,type:raw.key===E?'Epic':'Task',hierarchyLevel:raw.key===E?1:0,children:raw.key===E?[A,B]:[],predecessors:raw.key===B?[A]:[],successors:raw.key===A?[B]:[]}));
const captured={issues,calendar:oracle.calendar,uncertainty:'high',sourceVersion:1,milestones:[{id:target.id,name:targetName,date:'2026-10-16',scope:{type:'epic',id:'1',memberKeys:[A,B]}}]};
test('actual retained row/target/change projections match every authored expected API field',()=>{
 assert.deepEqual(reportIssueRows(captured),expected.expectedTimeline);
 const forecast=reportForecast(captured);
 assert.deepEqual(reportTargets(captured.milestones,issues).map(row=>({...row,...forecast.targets.get(row.key)})),[expected.expectedTarget]);
 assert.deepEqual(reportChanges(issues,issues.map(i=>({...i,buffer:'No'}))),expected.expectedChanges);
 assert.equal(forecast.forecast.coverage.sampledLeaves,2);assert.deepEqual([forecast.forecast.p50,forecast.forecast.p80,forecast.forecast.p90],['2026-11-02','2026-11-02','2026-11-03']);
});
test('actual report capacity matches all four independently authored rows and relevant availability',()=>{
 const readable={byId:new Map(admittedJira.map(i=>[i.id,i])),byKey:new Map(admittedJira.map(i=>[i.key,i]))};
 const value=reportCapacity({captured,planId:'local-plan',planName:'Local',settings:{selectedPlanIds:['local-plan'],profiles:{[person.accountId]:profile},issueChoices:{}},profileVersion:1,readable,startDate:'2026-10-05',endDate:'2026-10-30',readStartedAt:'2026-09-06T12:00:00Z',readAt:'2026-09-06T12:00:01Z'});
 assert.deepEqual(value.rows,expected.expectedCapacity);assert.deepEqual(value.availability,expected.expectedAvailability);assert.deepEqual(value.unallocated,[]);assert.ok(Math.abs(value.capacity.totals.allocatedHours-16)<1e-9);
});
