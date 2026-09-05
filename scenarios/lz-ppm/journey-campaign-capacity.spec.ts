import {createCapacityPreferences} from './capacity-preferences.mjs';
import {observedResponse} from './campaign-ui';
import {settledScreenshot} from './settled-screenshot.mjs';
import {replayHeaders} from './replay-headers.mjs';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {test,expect} from '../../fixtures/forge';
import {get,put} from '../../data/jira.mjs';
import {getTestState} from '../../testhook/client';
import {withOwnedSchedule,table,editDuration,row,save} from './normalization-owned-fixture';
import {openPlans,scheduleFields} from './forecast-fixture';
test.describe.configure({retries:0,timeout:900000});
const iso=(d:Date)=>d.toISOString().slice(0,10);
const add=(start:string,days:number)=>iso(new Date(Date.parse(start+'T00:00:00Z')+days*86400000));
function monday(){const d=new Date();const n=(8-d.getUTCDay())%7||7;return add(iso(d),n);}
function envelope(request:any){try{let raw=request.postDataBuffer();if(!raw)return null;if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString());}catch{return null;}}
const rpcBody=async(r:any)=>(await r.json()).data?.invokeExtension?.response?.body;
function response(page:any,name:string){return page.waitForResponse((r:any)=>envelope(r.request())?.variables?.input?.payload?.call?.functionKey===name,{timeout:120000}).then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const body=await rpcBody(r);expect(body.success).toBe(true);return body;});}
async function date(frame:any,within:any,label:string,value:string){await within.getByRole('button',{name:label,exact:true}).click();const cal=frame.locator('.lz-datepicker');const[year,month]=value.split('-').map(Number);const months=['January','February','March','April','May','June','July','August','September','October','November','December'];for(let n=0;n<30;n++){const title=(await cal.locator('span').first().textContent()).trim();if(title===`${months[month-1]} ${year}`)break;const[m,y]=title.split(' ');await cal.getByRole('button',{name:Number(y)*12+months.indexOf(m)<year*12+month-1?'Next month':'Previous month',exact:true}).click();}await expect(cal.locator('span').first()).toHaveText(`${months[month-1]} ${year}`);await cal.getByRole('button',{name:value,exact:true}).click();}

test('capacity: real Jira seconds deduplicate across plans, explicit availability and saved alternatives produce exact weekly loads',async({page},info)=>{
 const M=monday(),M2=add(M,7),end=add(M,13);const seeds=[{label:'shared20h',duration:10,start:M,due:add(M,11)},{label:'extra12h',duration:3,start:add(M,2),due:add(M,4)},{label:'other40h',duration:5,start:M,due:add(M,4)}];
 await withOwnedSchedule(page,info,seeds,async(f)=>{
  const[shared,extra,other]=f.keys;const me=await get('/rest/api/3/myself');const people=await get('/rest/api/3/user/assignable/search?project=WFH&maxResults=100');const second=people.find((p:any)=>p.active&&p.accountType==='atlassian'&&p.accountId!==me.accountId);expect(second,'second existing assignable person, not a second browser identity').toBeTruthy();
  const effort=[{key:shared,accountId:me.accountId,hours:20},{key:extra,accountId:me.accountId,hours:12},{key:other,accountId:second.accountId,hours:40}];
  for(const item of effort){await put(`/rest/api/3/issue/${item.key}`,{fields:{assignee:{accountId:item.accountId},timetracking:{originalEstimate:`${item.hours}h`,remainingEstimate:`${item.hours}h`}}});const actual=await get(`/rest/api/3/issue/${item.key}?fields=assignee,timeestimate,timetracking`);expect(actual.fields.timeestimate).toBe(item.hours*3600);expect(actual.fields.assignee.accountId).toBe(item.accountId);}
  let secondPlan:string|undefined,originalSettings:any,wire:any,bodyError:any;const notes:any={M,M2,end,people:{A:me.accountId,B:second.accountId},effort,privateSettingsRestored:false};const journal=()=>fs.writeFileSync(info.outputPath('capacity-journal.json'),JSON.stringify(notes,null,2));journal();
  const capture=async(req:any)=>{const data=envelope(req);if(data?.variables?.input?.payload?.call?.functionKey==='getCapacitySettings')wire={url:req.url(),data,headers:await req.allHeaders()};};page.on('request',capture);
  const invoke=async(name:string,payload:any={})=>{expect(wire,'observed authenticated current-user resolver envelope').toBeTruthy();const data=structuredClone(wire.data);data.variables.input.payload.call={functionKey:name,payload};const headers=replayHeaders(wire.headers);const res=await page.request.post(wire.url,{headers,data:JSON.stringify(data)});expect(res.status()).toBe(200);const body=await rpcBody(res);expect(body.success).toBe(true);return body;};
  const preferences=createCapacityPreferences({invoke,observe:(key:string)=>observedResponse(page,key),onState:(state:any)=>{notes.preferences=state;journal();}});
  try{
   const made=await getTestState('lz-ppm',{what:'createFixture',name:f.name+' secondary',jql:`key in (${shared},${other}) ORDER BY Rank ASC`});secondPlan=made.planId;if(typeof secondPlan!=='string'||!secondPlan)throw new Error('Secondary fixture creation returned no plan ID');notes.secondPlan=secondPlan;journal();
   await expect.poll(async()=>{const state=await getTestState('lz-ppm',{what:'plan',planId:secondPlan!});if(state.issues.length!==2)await getTestState('lz-ppm',{what:'refreshPlan',planId:secondPlan!});return state.issues.map((i:any)=>i.key).sort();},{timeout:90000}).toEqual([shared,other].sort());
   let frame=await openPlans(page);const initial=response(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const admitted=await initial;originalSettings=admitted.settings;preferences.admit(admitted);notes.originalSettings=originalSettings;journal();let cap=frame.locator('[data-testid="capacity-view"]');await expect(cap.getByRole('status')).toHaveCount(0,{timeout:120000});
   for(const box of await cap.getByRole('checkbox').all()){const title=await box.getAttribute('title');const wanted=title===`Include ${f.name}`||title===`Include ${f.name} secondary`;if((await box.getAttribute('aria-checked')==='true')!==wanted)await box.click();}
   await date(frame,cap,'Report starts',M);await date(frame,cap,'Report ends',end);let result:any;let body=await preferences.calculate(()=>cap.getByRole('button',{name:'Save selection and calculate',exact:true}).click());
   expect(body.report.coverage.uniqueIssues).toBe(3);expect(body.report.coverage.sharedDuplicatesRemoved).toBe(1);notes.initialReport=body.report;journal();
   const idA=body.report.people.find((p:any)=>p.accountId===me.accountId).id,idB=body.report.people.find((p:any)=>p.accountId===second.accountId).id;
   async function availability(id:string,partTime:string,reserve:string,leave?:string){await cap.locator(`tbody tr[data-person-id="${id}"]`).getByRole('button',{name:/availability/}).click();const form=cap.getByRole('form');await form.getByLabel('Hours per full working day',{exact:true}).fill('8');await form.getByLabel('Part-time percent',{exact:true}).fill(partTime);await form.getByLabel('Operational reserve percent',{exact:true}).fill(reserve);for(const day of['Sun','Sat']){const box=form.getByRole('checkbox',{name:`Works ${day}`});if(await box.getAttribute('aria-checked')==='true')await box.click();}for(const day of['Mon','Tue','Wed','Thu','Fri']){const box=form.getByRole('checkbox',{name:`Works ${day}`});if(await box.getAttribute('aria-checked')!=='true')await box.click();}for(const remove of await form.getByRole('button',{name:/Remove date off/}).all())await remove.click();if(leave){await date(frame,form,'Leave or holiday',leave);await form.getByRole('button',{name:'Add date off',exact:true}).click();}return preferences.calculate(()=>form.getByRole('button',{name:'Save availability and calculate',exact:true}).click());}
   await availability(idA,'50','25',add(M,3));body=await availability(idB,'100','0');
   const cell=(id:string,week:string)=>cap.locator(`[data-testid="capacity-cell"][data-person-id="${id}"][data-week="${week}"]`);
   await expect(cell(idA,M)).toContainText('22h / 12h');await expect(cell(idA,M)).toHaveAttribute('data-status','overloaded');await expect(cell(idA,M2)).toContainText('10h / 15h');await expect(cell(idB,M)).toContainText('40h / 40h');await expect(cell(idB,M2)).toContainText('0h / 40h');notes.numericReport=body.report;journal();await settledScreenshot(cap.getByRole('table',{name:'Weekly capacity'}),{path:info.outputPath('capacity-exact-numeric.png')});
   const beforeJira=await f.read(shared);await page.goto('about:blank');await getTestState('lz-ppm',{what:'applyEdit',planId:secondPlan,key:shared,field:'startDate',value:M2});await getTestState('lz-ppm',{what:'applyEdit',planId:secondPlan,key:shared,field:'duration',value:'5'});await getTestState('lz-ppm',{what:'applyEdit',planId:secondPlan,key:shared,field:'dueDate',value:add(M,11)});
   frame=await openPlans(page);result=response(page,'getCapacityReport');await frame.getByRole('button',{name:'Capacity',exact:true}).click();body=await result;cap=frame.locator('[data-testid="capacity-view"]');expect(body.report.coverage.conflictingIssues).toBe(1);await expect(cap).toContainText('1 unresolved alternatives');expect(body.report.totals.allocatedHours).toBe(52);notes.unresolvedReport=body.report;journal();
   await cap.getByRole('region',{name:'Conflicting plan alternatives'}).getByRole('combobox').click();body=await preferences.calculate(()=>frame.getByRole('option').filter({hasText:f.name+' secondary:'}).click());await expect(cell(idA,M)).toContainText('12h / 12h');await expect(cell(idA,M2)).toContainText('20h / 15h');expect(body.report.coverage.conflictingIssues).toBe(0);notes.chosenReport=body.report;journal();
   frame=await openPlans(page);const reopenedDay=iso(new Date());result=response(page,'getCapacityReport');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const reopenedReport=(await result).report;cap=frame.locator('[data-testid="capacity-view"]');
   // Report dates are visit-local rolling defaults; saved selection, profiles
   // and issue choice persist. Do not imply the custom window was retained.
   expect(reopenedReport.startDate).toBe(reopenedDay);expect(reopenedReport.endDate).toBe(add(reopenedDay,55));
   const dateText=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
   await expect(cap.getByRole('button',{name:'Report starts',exact:true})).toContainText(dateText(reopenedDay));await expect(cap.getByRole('button',{name:'Report ends',exact:true})).toContainText(dateText(add(reopenedDay,55)));
   notes.reopenedWindow={startDate:reopenedReport.startDate,endDate:reopenedReport.endDate,behavior:'visit-local rolling default'};journal();await expect(cell(idA,M)).toContainText('12h / 12h');await expect(cell(idA,M2)).toContainText('20h / 15h');expect(await f.read(shared)).toEqual(beforeJira);await settledScreenshot(cap,{path:info.outputPath('capacity-alternative-reopen.png')});
  }catch(error){bodyError=error;notes.bodyError=String(error);journal();throw error;}finally{
   const errors:any[]=[];let restorationError:any;
   try{const state=await preferences.restore();notes.privateSettingsRestored=!state.initialized||state.restored;journal();}
   catch(error:any){restorationError=error;errors.push(error);notes.settingsRestorationError=String(error.message);f.retainForRecovery(error,secondPlan?[{id:secondPlan,name:f.name+' secondary'}]:[]);notes.secondaryRetainedForRecovery=Boolean(secondPlan);journal();}
   page.off('request',capture);
   try{if(!page.isClosed())await page.goto('about:blank').catch(()=>page.close());}catch(error){errors.push(error);}
   if(secondPlan&&!restorationError)try{const own=await getTestState('lz-ppm',{what:'plan',planId:secondPlan});expect(own.meta.name).toBe(f.name+' secondary');await getTestState('lz-ppm',{what:'clearDrafts',planId:secondPlan});await getTestState('lz-ppm',{what:'deleteFixture',planId:secondPlan});notes.secondaryDeleted=true;journal();}catch(error){errors.push(error);}
   if(errors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...errors],'Capacity body/settings/secondary fixture cleanup failures');
  }
 },false,[0,1]);
});
