import {settledScreenshot} from './settled-screenshot.mjs';
// Real fixtures and resolver calls. The two controlled response tests disclose
// transport instrumentation; no fabricated backend state is counted as a pass.
import {gunzipSync} from 'node:zlib';
import {test,expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {withOwnedSchedule,table,row,editDuration,save,review} from './normalization-owned-fixture';
import {openPlan} from './forecast-fixture';
test.describe.configure({retries:0,timeout:600_000});
const seed=(label:string)=>({label,duration:5,start:'2026-10-05',due:'2026-10-09'});
function callOf(request:any){try{let raw=request.postDataBuffer();if(!raw)return null;if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString()).variables?.input?.payload?.call||null;}catch{return null;}}
const responseBody=async(response:any)=>(await response.json()).data?.invokeExtension?.response?.body;
function actualResponse(page:any,functionKey:string,planId:string){return page.waitForResponse((r:any)=>{const c=callOf(r.request());return c?.functionKey===functionKey&&c.payload?.planId===planId;},{timeout:90000}).then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const body=await responseBody(r);expect(body.success).toBe(true);return body;});}
async function exact(frame:any,key:string,duration:number,due:string){await expect(row(frame,key)).toHaveAttribute('data-row-duration',String(duration));await expect(row(frame,key)).toHaveAttribute('data-row-start','2026-10-05');await expect(row(frame,key)).toHaveAttribute('data-row-due',due);await expect(row(frame,key).locator(':scope > div').nth(5)).toHaveText(`${duration}d`);}

test('persistence: acknowledged Save7 replaces earlier autosaved6 before immediate reopen',async({page},info)=>{
 await withOwnedSchedule(page,info,[seed('older autosave')],async(f)=>{
  const key=f.keys[0];let frame=await table(page,f.name);const original=await f.read(key);
  const drafted=actualResponse(page,'saveDraft',f.planId);await editDuration(frame,key,'6');await drafted;
  await editDuration(frame,key,'7');await save(frame);
  // No arbitrary wait: close on the actual Saved acknowledgement.
  await page.goto('about:blank');frame=await table(page,f.name);await exact(frame,key,7,'2026-10-13');
  await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes','0');
  const stored=(await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues.find((i:any)=>i.key===key);expect(stored).toMatchObject({duration:7,startDate:'2026-10-05',dueDate:'2026-10-13'});
  expect(await f.read(key)).toEqual(original);await settledScreenshot(row(frame,key),{path:info.outputPath('save7-immediate-reopen.png')});
 });
});

test('persistence: an actual held Save response preserves a later local edit as unsaved',async({page},info)=>{
 await withOwnedSchedule(page,info,[seed('inflight save')],async(f)=>{
  const key=f.keys[0];let frame=await table(page,f.name);const original=await f.read(key);await editDuration(frame,key,'6');
  let release!:()=>void,arrived!:()=>void;const held=new Promise<void>(resolve=>release=resolve),received=new Promise<void>(resolve=>arrived=resolve);let captured:any,intercepted=false;
  const handler=async(route:any)=>{const c=callOf(route.request());if(intercepted||c?.functionKey!=='savePlanState'||c.payload?.planId!==f.planId)return route.continue();intercepted=true;const response=await route.fetch();const body=await responseBody(response);expect(body.success).toBe(true);captured={functionKey:c.functionKey,planId:f.planId,submitted:c.payload.issues.map((i:any)=>({key:i.key,duration:i.duration,startDate:i.startDate,dueDate:i.dueDate})),result:body};arrived();await held;await route.fulfill({response});};
  await page.route('**/gateway/api/graphql**',handler);
  try{
   await frame.locator('[data-testid="plan-save-btn"]').click();await expect.poll(()=>Boolean(captured),{timeout:60000,message:'real Save response reached the controlled hold'}).toBe(true);await received;
   await editDuration(frame,key,'7');await exact(frame,key,7,'2026-10-13');release();
   await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes','1');await expect(frame.locator('[data-testid="plan-save-btn"]')).toBeEnabled();
   await exact(frame,key,7,'2026-10-13');expect(captured.submitted.find((i:any)=>i.key===key).duration).toBe(6);
   expect((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues.find((i:any)=>i.key===key).duration).toBe(6);
   await info.attach('transport-instrumentation',{body:JSON.stringify({method:'Real savePlanState request executed and returned success; only its unchanged response delivery was held while the user edited7.',...captured}),contentType:'application/json'});
   await settledScreenshot(row(frame,key),{path:info.outputPath('late7-remains-unsaved.png')});await save(frame);frame=await table(page,f.name);await exact(frame,key,7,'2026-10-13');expect(await f.read(key)).toEqual(original);
  }finally{release();await page.unroute('**/gateway/api/graphql**',handler);}
 });
});

test('persistence: partial Apply discards a previously Saved sibling durably through completion reload',async({page},info)=>{
 await withOwnedSchedule(page,info,[seed('apply selected'),seed('discard saved sibling')],async(f)=>{
  const[a,b]=f.keys;let frame=await table(page,f.name);const originalB=await f.read(b);await editDuration(frame,a,'6');await editDuration(frame,b,'7');await save(frame);
  const modal=await review(frame);await expect(modal.locator('[data-testid="apply-change-row"]')).toHaveCount(2);await modal.locator(`[data-testid="apply-change-row"][data-issue-key="${b}"]`).getByRole('button').first().click();await expect(modal.locator('[data-testid="apply-review-subtitle"]')).toContainText('1 discarded');await modal.getByRole('button',{name:/^Apply 1 Change/i}).click();
  await expect(frame.getByText('Successfully wrote 1 issue',{exact:true})).toBeVisible({timeout:120000});
  await expect.poll(()=>f.read(a),{timeout:60000}).toEqual({key:a,start:'2026-10-05',due:'2026-10-12',duration:6});expect(await f.read(b)).toEqual(originalB);
  frame=await table(page,f.name);await exact(frame,a,6,'2026-10-12');await exact(frame,b,5,'2026-10-09');await expect(frame.getByRole('button',{name:/^Apply \d+ change/i})).toHaveCount(0);await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes','0');
  const stored=(await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues;expect(stored.find((i:any)=>i.key===b)).toMatchObject({duration:5,startDate:'2026-10-05',dueDate:'2026-10-09'});
  await settledScreenshot(row(frame,b),{path:info.outputPath('discarded-sibling-stays5.png')});await info.attach('actual-jira-second-reads',{body:JSON.stringify({applied:await f.read(a),discarded:await f.read(b)}),contentType:'application/json'});
 });
});

for(const status of[403,503])test(`persistence: simulated draft-read HTTP${status} gates edits and real Retry recovers unseen draft`,async({page},info)=>{
 await withOwnedSchedule(page,info,[seed('edit after recovery'),seed('unseen draft')],async(f)=>{
  const[a,b]=f.keys;let frame=await table(page,f.name);const drafted=actualResponse(page,'saveDraft',f.planId);await editDuration(frame,b,'9');await drafted;await page.goto('about:blank');let injected=0;
  const handler=async(route:any)=>{const c=callOf(route.request());if(injected||c?.functionKey!=='getDraft'||c.payload?.planId!==f.planId)return route.continue();injected++;await route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:`Harness simulated draft transport ${status}`})});};
  await page.route('**/gateway/api/graphql**',handler);
  try{
   frame=await openPlan(page,f.name);const alert=frame.getByRole('alert').filter({hasText:'Your saved draft could not be loaded'});await expect(alert).toBeVisible();expect(injected).toBe(1);await expect(frame.locator('[inert] [data-testid="plan-save-btn"]')).toHaveCount(1);await settledScreenshot(alert,{path:info.outputPath(`draft-${status}-blocked.png`)});
   const recovered=actualResponse(page,'getDraft',f.planId);await alert.getByRole('button',{name:'Retry saved draft',exact:true}).click();const body=await recovered;expect(body.draft.changes[b].duration).toBe(9);await expect(alert).toHaveCount(0);await frame.getByRole('button',{name:/^Table/i}).first().click();await exact(frame,b,9,'2026-10-15');await editDuration(frame,a,'6');await save(frame);frame=await table(page,f.name);await exact(frame,a,6,'2026-10-12');await exact(frame,b,9,'2026-10-15');
   await settledScreenshot(row(frame,b),{path:info.outputPath(`draft-${status}-recovered9.png`)});await info.attach('failure-instrumentation',{body:JSON.stringify({injectedHttpStatus:status,request:'getDraft',planId:f.planId,count:injected,realRetry:true,backendDraftNeverMutatedByFault:true}),contentType:'application/json'});
  }finally{await page.unroute('**/gateway/api/graphql**',handler);}
 });
});
