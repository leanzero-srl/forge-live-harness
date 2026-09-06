import {createCapacityPreferences} from './capacity-preferences.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {test,expect} from '../../fixtures/forge';
import {get,put} from '../../data/jira.mjs';
import {getTestState} from '../../testhook/client';
import {withOwnedSchedule} from './normalization-owned-fixture';
import {openPlans} from './forecast-fixture';
import {currentUserResolver,actualResponse,observedResponse,chooseDate} from './campaign-ui';
import {settledScreenshot} from './settled-screenshot.mjs';

test.describe.configure({retries:0,timeout:900000});
const LARGE='plan-mtbrlh8n-7ghw8u';
const REFUSAL='Select at most 5000 distinct issues for one capacity report. No partial report was produced.';
const add=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const hash=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('capacity size limit: actual 5300-issue selection refuses a partial report, clears prior 8h/40h totals and recovers on a supported selection',async({page},info)=>{
 const now=new Date(),M=add(now.toISOString().slice(0,10),(8-now.getUTCDay())%7||7),end=add(M,4);
 const large=await getTestState('lz-ppm',{what:'plan',planId:LARGE});
 expect(large.meta).toMatchObject({id:LARGE,name:'LZPP Perf',status:'indexed',issueCount:5300});
 expect(large.issues.map((i:any)=>i.key).sort()).toEqual(Array.from({length:5300},(_,n)=>`LZPP-${n+1}`).sort());
 expect(new Set(large.issues.map((i:any)=>String(i.id))).size).toBe(5300);
 for(const issue of large.issues)expect(String(issue.id)).toMatch(/^\d+$/);
 await withOwnedSchedule(page,info,[{label:'capacity limit positive 8h',duration:5,start:M,due:end}],async(f)=>{
  const key=f.keys[0],me=await get('/rest/api/3/myself');await f.read(key);
  await put(`/rest/api/3/issue/${key}`,{fields:{assignee:{accountId:me.accountId},timetracking:{originalEstimate:'8h',remainingEstimate:'8h'}}});
  const readEffort=async()=>{const actual=await get(`/rest/api/3/issue/${key}?fields=project,summary,assignee,timeestimate,status`);expect(actual.key).toBe(key);expect(actual.fields.project.key).toBe('WFH');expect(actual.fields.summary).toBe(`${f.name} capacity limit positive 8h`);expect(actual.fields.status.statusCategory.key).not.toBe('done');expect(actual.fields.assignee.accountId).toBe(me.accountId);expect(actual.fields.timeestimate).toBe(28800);return {key,id:actual.id,assignee:actual.fields.assignee.accountId,seconds:actual.fields.timeestimate};};
  const effort=await readEffort();expect((await getTestState('lz-ppm',{what:'refreshPlan',planId:f.planId})).ok).toBe(true);
  const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');
  let original:any,lastOwned:any,bodyError:any,restored=false;
  const journal:any={M,end,largePlanId:LARGE,largeIssues:5300,largeHash:hash(large.issues),effort,steps:[]};
  const retain=()=>fs.writeFileSync(info.outputPath('capacity-limit-journal.json'),JSON.stringify(journal,null,2));retain();
  const preferences=createCapacityPreferences({invoke:rpc.invoke,observe:(key:string)=>observedResponse(page,key),onState:(state:any)=>{journal.preferences=state;journal.lastOwnedSettings=state.lastOwned;retain();}});
  try{
   let frame=await openPlans(page),pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();
   const initial=await pending;original=initial.settings;preferences.admit(initial);journal.originalSettings=original;retain();
   await expect(frame.locator('[data-testid="capacity-view"]').getByRole('status')).toHaveCount(0,{timeout:120000});
   const profile={hoursPerDay:8,partTimePct:100,reservePct:0,workingDays:[1,2,3,4,5],leaveDates:[]};
   const setup=await preferences.write({selectedPlanIds:[f.planId],profiles:{...original.profiles,[me.accountId]:profile},issueChoices:{}});
   expect(setup.success).toBe(true);lastOwned=setup.settings;journal.lastOwnedSettings=lastOwned;retain();
   frame=await openPlans(page);pending=actualResponse(page,'getCapacityReport');await frame.getByRole('button',{name:'Capacity',exact:true}).click();await pending;
   const cap=frame.locator('[data-testid="capacity-view"]');await chooseDate(frame,cap,'Report starts',M);await chooseDate(frame,cap,'Report ends',end);
   const calculate=()=>preferences.calculate(()=>cap.getByRole('button',{name:'Save selection and calculate',exact:true}).click(),{allowReportFailure:true});
   const selectOnly=async(name:string)=>{
    const boxes=cap.getByRole('checkbox');await expect(boxes).not.toHaveCount(0);
    const target=cap.getByRole('checkbox',{name:`Include ${name}`,exact:true});await expect(target).toHaveCount(1);
    for(const box of await boxes.all()){const wanted=(await box.getAttribute('title'))===`Include ${name}`;if((await box.getAttribute('aria-checked')==='true')!==wanted)await box.click();}
    await expect(target).toHaveAttribute('aria-checked','true');
   };
   const assertPositive=async(body:any)=>{
    expect(body.success).toBe(true);expect(body.report.coverage).toMatchObject({selectedPlans:1,uniqueIssues:1,missingEffort:0,unavailableIssueCount:0,sharedDuplicatesRemoved:0});
    expect(body.report.weeks).toEqual([{key:M,startDate:M,endDate:end}]);expect(body.report.totals.knownEffortHours).toBe(8);expect(body.report.totals.allocatedHours).toBeCloseTo(8,9);expect(body.report.totals.unallocatedHours).toBe(0);expect(body.report.totals.outsideWindowHours).toBe(0);
    const cell=cap.locator(`[data-testid="capacity-cell"][data-person-id="${me.accountId}"][data-week="${M}"]`);await expect(cap.locator('[data-testid="capacity-cell"]')).toHaveCount(1);await expect(cell).toHaveAttribute('data-status','available');await expect(cell).toContainText('8h / 40h');await expect(cell).toContainText('20%');await expect(cap.getByRole('alert')).toHaveCount(0);return cell;
   };
   const positive=await calculate();await settledScreenshot(await assertPositive(positive),{path:info.outputPath('capacity-size-supported-positive.png')});journal.steps.push({name:'supported-before',report:positive.report});retain();
   await selectOnly(large.meta.name);await expect(cap.locator('[data-testid="capacity-cell"]')).toHaveCount(0);await expect(cap.locator('[data-testid="capacity-coverage"]')).toHaveCount(0);
   const refusal=await calculate();journal.steps.push({name:'actual-size-refusal',response:refusal});retain();expect(refusal).toEqual({success:false,error:REFUSAL});
   const alert=cap.getByRole('alert');await expect(alert).toContainText(REFUSAL);await expect(cap.getByRole('status')).toHaveCount(0);await expect(cap.locator('[data-testid="capacity-cell"]')).toHaveCount(0);await expect(cap.locator('[data-testid="capacity-coverage"]')).toHaveCount(0);await expect(cap.getByRole('table',{name:'Weekly capacity',exact:true})).toHaveCount(0);await settledScreenshot(cap,{path:info.outputPath('capacity-5300-explicit-no-partial-report.png')});
   await selectOnly(f.name);const recovered=await calculate();await settledScreenshot(await assertPositive(recovered),{path:info.outputPath('capacity-size-supported-recovery.png')});journal.steps.push({name:'supported-after',report:recovered.report});retain();
   expect(await readEffort()).toEqual(effort);expect((await getTestState('lz-ppm',{what:'plan',planId:LARGE})).issues).toEqual(large.issues);journal.largeSourceUnchanged=true;retain();
  }catch(error){bodyError=error;journal.bodyError=String(error);retain();throw error;
  }finally{
   const cleanupErrors:any[]=[];
   try{const state=await preferences.restore();restored=!state.initialized||state.restored;}
   catch(error){f.retainForRecovery(error);cleanupErrors.push(error);journal.settingsRestoreError=String(error);}
   finally{rpc.stop();journal.privateSettingsRestored=restored;retain();}
   try{expect((await getTestState('lz-ppm',{what:'plan',planId:LARGE})).issues).toEqual(large.issues);journal.largeSourceGuard=true;}catch(error){cleanupErrors.push(error);journal.largeSourceGuardError=String(error);}retain();
   if(cleanupErrors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...cleanupErrors],'Capacity size test and/or exact private settings restoration failed');
  }
 });
});
