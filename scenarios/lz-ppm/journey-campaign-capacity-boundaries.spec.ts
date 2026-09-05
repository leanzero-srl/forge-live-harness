import {createCapacityPreferences} from './capacity-preferences.mjs';
import {settledScreenshot} from './settled-screenshot.mjs';
import fs from 'node:fs';
import {test,expect} from '../../fixtures/forge';
import {get,put} from '../../data/jira.mjs';
import {withOwnedSchedule,table} from './normalization-owned-fixture';
import {openPlans} from './forecast-fixture';
import {currentUserResolver,actualResponse,chooseDate,callOf,observedResponse} from './campaign-ui';
test.describe.configure({retries:0,timeout:900000});
const add=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function monday(){const now=new Date(),date=now.toISOString().slice(0,10);return add(date,(8-now.getUTCDay())%7||7);}

test('capacity boundaries: real missing and zero effort, custom-calendar partial week, unknown/zero availability and failed refresh never show false spare capacity',async({page},info)=>{
 const M=monday(),end=add(M,4);
 await withOwnedSchedule(page,info,['24h demand','missing effort','zero effort','unassigned effort'].map(label=>({label,duration:5,start:M,due:end})),async(f)=>{
  const[demand,missing,zero,unassigned]=f.keys,me=await get('/rest/api/3/myself');
  const people=await get('/rest/api/3/user/assignable/search?project=WFH&maxResults=100');const other=people.find((p:any)=>p.active&&p.accountType==='atlassian'&&p.accountId!==me.accountId);expect(other,'real second assignee, not another browser identity').toBeTruthy();
  for(const item of[{key:demand,id:me.accountId,hours:24},{key:missing,id:me.accountId,hours:null},{key:zero,id:other.accountId,hours:0},{key:unassigned,id:null,hours:6}]){
   await f.read(item.key);await put(`/rest/api/3/issue/${item.key}`,{fields:{assignee:item.id?{accountId:item.id}:null,...(item.hours!==null?{timetracking:{originalEstimate:`${item.hours}h`,remainingEstimate:`${item.hours}h`}}:{})}});
   const live=await get(`/rest/api/3/issue/${item.key}?fields=assignee,timeestimate`);expect(live.fields.timeestimate).toBe(item.hours===null?null:item.hours*3600);expect(live.fields.assignee?.accountId??null).toBe(item.id);
  }
  const scheduleBefore=await Promise.all(f.keys.map((key:string)=>f.read(key)));
  let frame=await table(page,f.name);
  await frame.getByRole('button',{name:/^Schedule/i}).first().click();await frame.getByRole('button',{name:/Create Custom Calendar/}).click();await frame.getByPlaceholder('e.g., Saudi Arabia (Sun-Thu)').fill('Capacity Mon Wed Fri');await frame.getByRole('button',{name:'Tue',exact:true}).click();await frame.getByRole('button',{name:'Thu',exact:true}).click();await frame.getByRole('button',{name:'Apply Custom Calendar',exact:true}).click();await expect(frame.getByText('Capacity Mon Wed Fri',{exact:true})).toBeVisible();
  const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');let original:any,restored=false,bodyError:any;
  const journal:any={M,end,keys:f.keys,assignees:{A:me.accountId,B:other.accountId},steps:[]};const retain=()=>fs.writeFileSync(info.outputPath('capacity-boundaries-journal.json'),JSON.stringify(journal,null,2));retain();
  const preferences=createCapacityPreferences({invoke:rpc.invoke,observe:(key:string)=>observedResponse(page,key),onState:(state:any)=>{journal.preferences=state;retain();}});
  try{
   frame=await openPlans(page);let pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const admitted=await pending;original=admitted.settings;preferences.admit(admitted);journal.originalSettings=original;retain();let cap=frame.locator('[data-testid="capacity-view"]');await expect(cap.getByRole('status')).toHaveCount(0,{timeout:120000});
   // Restore the original settings in finally; starting from absent assumptions
   // must be deliberate even when this account had earlier saved profiles.
   const clean=await preferences.write({selectedPlanIds:[f.planId],profiles:{},issueChoices:{}});expect(clean.success).toBe(true);
   frame=await openPlans(page);pending=actualResponse(page,'getCapacityReport');await frame.getByRole('button',{name:'Capacity',exact:true}).click();await pending;cap=frame.locator('[data-testid="capacity-view"]');
   await chooseDate(frame,cap,'Report starts',add(M,1));await chooseDate(frame,cap,'Report ends',end);let body=await preferences.calculate(()=>cap.getByRole('button',{name:'Save selection and calculate',exact:true}).click());
   expect(body.report.weeks).toEqual([{key:M,startDate:add(M,1),endDate:end}]);expect(body.report.coverage).toMatchObject({uniqueIssues:4,missingEffort:1,unassignedIssues:1});expect(body.report.totals).toMatchObject({knownEffortHours:30,allocatedHours:20,outsideWindowHours:10,unallocatedHours:0});
   const A=me.accountId,B=other.accountId;const cell=(id:string)=>cap.locator(`[data-testid="capacity-cell"][data-person-id="${id}"][data-week="${M}"]`);
   await expect(cell(A)).toContainText('16h / ?h');await expect(cell(A)).toHaveAttribute('data-status','capacity-unknown');await expect(cell(A)).not.toContainText('%');await expect(cell(B)).toContainText('0h / ?h');await expect(cell('unassigned')).toContainText('4h / ?h');journal.steps.push({name:'missing-zero-partial-week',report:body.report});retain();
   const availability=async(id:string,hours:string,leave:boolean,observeConsistency=false)=>{
    await cap.locator(`tr[data-person-id="${id}"]`).getByRole('button',{name:/availability/}).click();const form=cap.getByRole('form');await form.getByLabel('Hours per full working day',{exact:true}).fill(hours);await form.getByLabel('Part-time percent',{exact:true}).fill('100');await form.getByLabel('Operational reserve percent',{exact:true}).fill('0');
    for(const day of['Sun','Mon','Tue','Wed','Thu','Fri','Sat']){const box=form.getByRole('checkbox',{name:`Works ${day}`,exact:true});const wanted=['Mon','Wed','Fri'].includes(day);if((await box.getAttribute('aria-checked')==='true')!==wanted)await box.click();}
    for(const remove of await form.getByRole('button',{name:/Remove date off/}).all())await remove.click();if(leave){await chooseDate(frame,form,'Leave or holiday',add(M,2));await form.getByRole('button',{name:'Add date off',exact:true}).click();}
    return preferences.calculate(()=>form.getByRole('button',{name:'Save availability and calculate',exact:true}).click(),{allowReportFailure:observeConsistency});
   };
   body=await availability(A,'16',true);await expect(cell(A)).toContainText('16h / 16h');await expect(cell(A)).toHaveAttribute('data-status','effort-unknown');await expect(cell(A)).not.toContainText('%');await expect(cell(A)).toContainText('1 work item(s) not fully allocated');
   await availability(A,'0',true);await expect(cell(A)).toHaveAttribute('data-status','overloaded');await expect(cell(A)).toContainText('16h / 0h');await expect(cell(A)).not.toContainText('%');
   body=await availability(B,'0',false);await expect(cell(B)).toHaveAttribute('data-status','no-capacity');await expect(cell(B)).toContainText('0h / 0h');await expect(cell(B)).not.toContainText('%');await settledScreenshot(cap,{path:info.outputPath('capacity-zero-and-unknown-controls.png')});journal.steps.push({name:'explicit-zero-capacity',report:body.report});retain();
   // A real correction of only the owned missing-effort issue distinguishes
   // unknown work from explicit zero. Duration remains5 throughout.
   await put(`/rest/api/3/issue/${missing}`,{fields:{timetracking:{originalEstimate:'0h',remainingEstimate:'0h'}}});expect((await get(`/rest/api/3/issue/${missing}?fields=timeestimate`)).fields.timeestimate).toBe(0);
   body=await availability(A,'16',true,true);
   journal.steps.push({name:'actual-report-after-owned-effort-correction',response:body});retain();
   if(body.success!==true){
    // Only this observed consistency refusal licenses one explicit user Retry.
    // Other resolver failures remain failures; there is no hidden recalculation.
    expect(body).toEqual({success:false,error:'A selected plan changed during the read. Retry the report.'});
    const alert=cap.getByRole('alert');await expect(alert).toContainText(body.error);
    await expect(cap.locator('[data-testid="capacity-cell"]')).toHaveCount(0);
    await expect(cap.locator('[data-testid="capacity-coverage"]')).toHaveCount(0);
    await settledScreenshot(alert,{path:info.outputPath('capacity-actual-consistency-refusal-clears-totals.png')});
    body=await preferences.calculate(()=>alert.getByRole('button',{name:'Retry',exact:true}).click());
    await expect(alert).toHaveCount(0);journal.steps.push({name:'actual-consistency-refusal-explicit-real-retry',report:body.report});retain();
   }
   expect(body.report.coverage.missingEffort).toBe(0);await expect(cell(A)).toHaveAttribute('data-status','at-capacity');await expect(cell(A)).toContainText('100%');journal.steps.push({name:'missing-corrected-to-zero',report:body.report});retain();
   for(const status of[403,503]){
    let injected=0;const handler=async(route:any)=>{const c=callOf(route.request());if(injected||c?.functionKey!=='getCapacityReport')return route.continue();injected++;return route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:`Harness simulated capacity transport ${status}`})});};
    await page.route('**/gateway/api/graphql**',handler);
    try{await preferences.beginWrite({kind:'UI report failure control'});const acknowledged=observedResponse(page,'saveCapacitySettings').then(preferences.acknowledge);acknowledged.catch(()=>{});await cap.getByRole('button',{name:'Save selection and calculate',exact:true}).click();await acknowledged;const alert=cap.getByRole('alert');await expect(alert).toBeVisible();expect(injected).toBe(1);await expect(cap.locator('[data-testid="capacity-cell"]')).toHaveCount(0);await expect(cap.locator('[data-testid="capacity-coverage"]')).toHaveCount(0);await expect(alert).not.toContainText('useInvokeExtensionRelayMutation');await settledScreenshot(alert,{path:info.outputPath(`capacity-${status}-clears-old-totals.png`)});
     body=await preferences.calculate(()=>alert.getByRole('button',{name:'Retry',exact:true}).click());await expect(alert).toHaveCount(0);await expect(cell(A)).toHaveAttribute('data-status','at-capacity');await expect(cell(A)).toContainText('16h / 16h');expect(body.report.totals.allocatedHours).toBe(20);journal.steps.push({name:'simulated-report-failure-real-retry',injectedHttpStatus:status,requestsInjected:injected,realReport:body.report});retain();
    }finally{await page.unroute('**/gateway/api/graphql**',handler);}
   }
   expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(scheduleBefore);await settledScreenshot(cap,{path:info.outputPath('capacity-boundaries-real-retry.png')});
  }catch(error){bodyError=error;journal.bodyError=String(error);retain();throw error;}finally{
   try{const state=await preferences.restore();restored=!state.initialized||state.restored;}
   catch(error){f.retainForRecovery(error);journal.settingsRestorationError=String(error);retain();throw new AggregateError([...(bodyError?[bodyError]:[]),error],'Capacity boundary body/settings recovery failures');}
   finally{rpc.stop();journal.privateSettingsRestored=restored;retain();}
  }
 });
});
