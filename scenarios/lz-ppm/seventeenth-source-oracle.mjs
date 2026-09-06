import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
export const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
// Independent arithmetic for this exact all-null imported5300 fixture, not a generic hydration replacement.
export function sourceOracle(plan,calendar,payload,contextHash){
 assert.equal(plan.meta.issueCount,5300);assert.equal(plan.issues.length,5300);assert.equal(plan.meta.mode,undefined);assert.deepEqual(plan.meta.milestones,[]);assert.deepEqual(calendar,{calendarName:'Standard (Mon-Fri)',holidays:[],workingDays:[1,2,3,4,5]});
 assert.deepEqual(payload,{planId:plan.meta.id,name:'Every existing performance row',kind:'report',uncertainty:'medium',expectedVersion:plan.meta.version,changes:[],includeCapacity:false,requestId:'2d8c3fef-b28e-45a5-b4bc-06755e609e03'});
 const raw=structuredClone(plan.issues).sort((a,b)=>a.key.localeCompare(b.key)),context={meta:plan.meta,calendar,deps:{}};assert.equal(hash(context),contextHash,'Exact retained context hash independently proves calendar/meta/empty lags');
 let missing=0,dated=0;const capturedRows=raw.map(row=>{
  assert.equal(row.duration,null);assert.equal(row._original.duration,null);assert.equal(row._original.startDate,row.startDate);assert.equal(row._original.dueDate,row.dueDate);assert.equal(row.predecessorLags,undefined);assert.notEqual(row.durationExplicitlyCleared,true);assert.notEqual(row.capturedDuration,true);
  const start=Date.parse(row.startDate+'T00:00:00Z'),end=Date.parse(row.dueDate+'T00:00:00Z');assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&end>=start);let days=0;for(let t=start;t<=end;t+=86400000){const day=new Date(t).getUTCDay();if(day!==0&&day!==6)days++;}
  const {fieldAvail,...issue}=row;if(days){issue.duration=days;issue._original={...issue._original,duration:days};dated++;}else missing++;return issue;
 });assert.equal(dated,5141);assert.equal(missing,159);
 const captured={kind:payload.kind,name:payload.name,sourceVersion:plan.meta.version,sources:plan.meta.sources,calendar,milestones:[],uncertainty:'medium',fieldOverrides:plan.meta.fieldOverrides||{},assets:plan.meta.assets||null,workingChangeCount:0,issues:capturedRows};
 return {source:{rawHash:hash(raw),rawIssueCount:5300,basisHash:hash({...context,issues:raw}),capturedHash:hash(captured),capturedIssueCount:5300,forecastInputHash:hash({issues:capturedRows,calendar,targets:[],uncertainty:'medium'}),targetCount:0},captured,raw,context};
}
