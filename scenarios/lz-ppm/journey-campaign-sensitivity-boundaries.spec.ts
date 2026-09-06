import {settledScreenshot} from './settled-screenshot.mjs';
import {test,expect} from '../../fixtures/forge';
import {get,post} from '../../data/jira.mjs';
import {getTestState} from '../../testhook/client';
import {withOwnedSchedule,table,row,save} from './normalization-owned-fixture';
import {scheduleFields} from './forecast-fixture';
import {planning,chooseDate} from './campaign-ui';
test.describe.configure({retries:0,timeout:900000});

// Deterministic race instrument, not an alternative engine: hold the iframe's
// actual zero-delay yield callbacks, exercise Cancel/scope selection, then release
// those exact unchanged callbacks. No source data or numerical result is mocked.
async function holdZeroDelay(panel:any){
 await panel.evaluate((el:any)=>{const w=el.ownerDocument.defaultView;if(w.__lzSensitivityYield)throw Error('Existing timer instrument');const originalSet=w.setTimeout,originalClear=w.clearTimeout;const pending=new Map();w.__lzSensitivityYield={pending,originalSet,originalClear};w.setTimeout=function(fn:any,delay:any,...args:any[]){if(delay===0&&typeof fn==='function'){const id=originalSet.call(w,()=>{},86400000);pending.set(id,{fn,args});return id;}return originalSet.call(w,fn,delay,...args);};w.clearTimeout=function(id:any){pending.delete(id);return originalClear.call(w,id);};});
 return async()=>panel.evaluate((el:any)=>{const w=el.ownerDocument.defaultView,held=w.__lzSensitivityYield;if(!held)return;w.setTimeout=held.originalSet;w.clearTimeout=held.originalClear;delete w.__lzSensitivityYield;for(const[id,call]of held.pending){held.originalClear.call(w,id);held.originalSet.call(w,call.fn,0,...call.args);}});
}

test('sensitivity: tied branches have no solo-shortening benefit; actual yielded cancellation and scope change never publish old or partial rankings',async({page},info)=>{
 await withOwnedSchedule(page,info,['tie one','tie two'].map(label=>({label,duration:5,start:'2026-03-02',due:'2026-03-06'})),async(f)=>{
  let frame=await table(page,f.name);const before=scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues);const jira=await Promise.all(f.keys.map((key:string)=>f.read(key)));const work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();const targets=frame.locator('[data-testid="targets-editor"]');await targets.getByRole('button',{name:'Add target',exact:true}).click();const form=targets.locator('form');await form.getByLabel('Target name',{exact:true}).fill('Same full scope target');await chooseDate(frame,form,'Target date','2026-03-20');await form.getByRole('button',{name:'Save target',exact:true}).click();await expect(form).toHaveCount(0);
  await frame.getByRole('button',{name:/^Dashboard/i}).first().click();await expect(frame.locator('[data-testid="schedule-confidence"]')).toHaveAttribute('data-runs','300');const panel=frame.locator('[data-testid="finish-sensitivity"]');const run=panel.getByRole('button',{name:'Test finish sensitivity',exact:true});await run.click();await expect(panel).toContainText('settled finish 2026-03-06');await expect(panel).toContainText('2 tasks tested');
  const exact=async()=>{await expect(panel.locator('[data-testid="finish-effect"]')).toHaveCount(2);for(const key of f.keys){const item=panel.locator(`[data-testid="finish-effect"][data-key="${key}"]`);await expect(item.locator('td').nth(0)).toHaveText('2026-03-06 (0 calendar days earlier)');await expect(item.locator('td').nth(1)).toHaveText('2026-03-09 (3 calendar days later)');}};
  await exact();await settledScreenshot(panel,{path:info.outputPath('sensitivity-parallel-ties.png')});
  for(const action of ['cancel','scope-change']){
   const release=await holdZeroDelay(panel);
   try{
    await run.click();await expect.poll(()=>panel.evaluate((el:any)=>el.ownerDocument.defaultView.__lzSensitivityYield.pending.size),{timeout:10000,message:'actual algorithm reached its zero-delay yield'}).toBeGreaterThan(0);await expect(panel.locator('[data-testid="finish-effect"]')).toHaveCount(0);await expect(panel.getByRole('button',{name:'Cancel analysis',exact:true})).toBeVisible();
    if(action==='cancel'){await panel.getByRole('button',{name:'Cancel analysis',exact:true}).click();await expect(panel).toContainText('Analysis cancelled. No partial ranking is shown.');}
    else{await panel.getByRole('combobox').click();await panel.getByRole('option',{name:'Same full scope target',exact:true}).click();await expect(panel.getByRole('button',{name:'Cancel analysis',exact:true})).toHaveCount(0);}
    await expect(panel.locator('[data-testid="finish-effect"]')).toHaveCount(0);await release();await expect(run).toBeEnabled();await expect(panel.locator('[data-testid="finish-effect"]')).toHaveCount(0);await settledScreenshot(panel,{path:info.outputPath(`sensitivity-${action}-no-ranking.png`)});
   }finally{await release();}
   await run.click();await expect(panel).toContainText('2 tasks tested');await exact();
  }
  expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues)).toEqual(before);expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(jira);await info.attach('sensitivity-race-instrumentation',{body:JSON.stringify({instrument:'Held actual iframe setTimeout(fn,0) callbacks after a real algorithm yield; restored timers and delivered original callbacks unchanged. No model data, result, clock date, or resolver response was replaced.',actions:['cancel','scope-change'],postReleaseFullReruns:2}),contentType:'application/json'});
 });
});

test('sensitivity: fixed buffer absorbs predecessor changes and buffer, completed work and declared zero are not directly perturbed',async({page},info)=>{
 await withOwnedSchedule(page,info,[
  {label:'buffer predecessor',duration:8,start:'2026-06-01',due:'2026-06-10'},
  {label:'fixed buffer',duration:7,start:'2026-06-11',due:'2026-06-19'},
  {label:'declared milestone',duration:0,start:'2026-06-01',due:'2026-06-01'},
  {label:'completed work',duration:2,start:'2026-05-04',due:'2026-05-05'},
 ],async(f)=>{
  const[pred,buffer,zero,completed]=f.keys;await f.read(completed);const transitions=await get(`/rest/api/3/issue/${completed}/transitions`);const done=transitions.transitions.find((t:any)=>t.to.statusCategory.key==='done');expect(done).toBeTruthy();await post(`/rest/api/3/issue/${completed}/transitions`,{transition:{id:done.id}});expect((await get(`/rest/api/3/issue/${completed}?fields=status`)).fields.status.statusCategory.key).toBe('done');
  await getTestState('lz-ppm',{what:'refreshPlan',planId:f.planId});let frame=await table(page,f.name);await expect(row(frame,zero)).toHaveAttribute('data-row-duration','0');await row(frame,buffer).locator(':scope > div').nth(6).click();await expect(row(frame,buffer).locator(':scope > div').nth(6)).toHaveText('Buffer');await save(frame);frame=await table(page,f.name);
  const before=(await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues;expect(before.find((i:any)=>i.key===buffer)).toMatchObject({buffer:'Yes',startDate:'2026-06-11',dueDate:'2026-06-19'});expect(before.find((i:any)=>i.key===completed).statusCategory).toBe('done');const jira=await Promise.all(f.keys.map((key:string)=>f.read(key)));
  await frame.getByRole('button',{name:/^Dashboard/i}).first().click();const panel=frame.locator('[data-testid="finish-sensitivity"]');await panel.getByRole('button',{name:'Test finish sensitivity',exact:true}).click();await expect(panel).toContainText('settled finish 2026-06-19');await expect(panel).toContainText('1 tasks tested');await expect(panel).toContainText('No individual task changed this finish');await panel.getByRole('button',{name:'Show all tested tasks',exact:true}).click();await expect(panel.locator('[data-testid="finish-effect"]')).toHaveCount(1);const actual=panel.locator(`[data-testid="finish-effect"][data-key="${pred}"]`);await expect(actual.locator('td').nth(0)).toHaveText('2026-06-19 (0 calendar days earlier)');await expect(actual.locator('td').nth(1)).toHaveText('2026-06-19 (0 calendar days later)');for(const key of [buffer,zero,completed])await expect(panel.locator(`[data-testid="finish-effect"][data-key="${key}"]`)).toHaveCount(0);await settledScreenshot(panel,{path:info.outputPath('sensitivity-fixed-buffer-and-exclusions.png')});
  expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues)).toEqual(scheduleFields(before));expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(jira);
 },[[0,1]]);
});
