import fs from 'node:fs';
import {test,expect} from '../../fixtures/forge';
import {get,post,put,request,BASE} from '../../data/jira.mjs';
import {requireEnv} from '../../data/env.mjs';
import {getTestState} from '../../testhook/client';
import {withOwnedSchedule,table} from './normalization-owned-fixture';
import {planning,chooseDate,currentUserResolver} from './campaign-ui';
import {settledScreenshot} from './settled-screenshot.mjs';

test.describe.configure({retries:0,timeout:900000});

// Hold only actual zero-delay yields. Restore and deliver the original callbacks;
// no clock, source issue, resolver reply, simulation result or DOM is replaced.
async function holdForecastYield(body:any){
 await body.evaluate((el:any)=>{const w=el.ownerDocument.defaultView;if(w.__lzEpicYield)throw Error('Existing timer instrument');const set=w.setTimeout,clear=w.clearTimeout,pending=new Map();w.__lzEpicYield={set,clear,pending};w.setTimeout=function(fn:any,delay:any,...args:any[]){if(delay===0&&typeof fn==='function'){const id=set.call(w,()=>{},86400000);pending.set(id,{fn,args});return id;}return set.call(w,fn,delay,...args);};w.clearTimeout=function(id:any){pending.delete(id);return clear.call(w,id);};});
 return ()=>body.evaluate((el:any)=>{const w=el.ownerDocument.defaultView,h=w.__lzEpicYield;if(!h)return;w.setTimeout=h.set;w.clearTimeout=h.clear;delete w.__lzEpicYield;for(const[id,c]of h.pending){h.clear.call(w,id);h.set.call(w,c.fn,0,...c.args);}});
}

test('epic targets: actual hierarchy retains outside predecessor influence; target edit during a yielded forecast cannot publish the old commitment',async({page},info)=>{
 await withOwnedSchedule(page,info,[
  {label:'outside epic predecessor',duration:5,start:'2026-03-02',due:'2026-03-06'},
  {label:'epic child',duration:5,start:'2026-03-09',due:'2026-03-13'},
  {label:'unrelated December work',duration:5,start:'2026-12-07',due:'2026-12-11'},
 ],async(f)=>{
  expect(BASE).toBe('https://wolfaenpak.atlassian.net');
  const[pred,member,late]=f.keys,source=await Promise.all(f.keys.map((key:string)=>f.read(key)));
  const name=`${f.name} Epic target`,summary=`${name} owned parent`;
  const journal:any={name,summary,source,phase:'before-owned-epic',epic:null,planId:null};
  const retain=()=>fs.writeFileSync(info.outputPath('epic-target-journal.json'),JSON.stringify(journal,null,2));retain();
  let rpc:any,release:any;
  const ownEpic=async()=>{const i=await get(`/rest/api/3/issue/${journal.epic.key}?fields=project,issuetype,summary`);expect(i.id).toBe(journal.epic.id);expect(i.fields.project.key).toBe('WFH');expect(i.fields.issuetype.id).toBe('10000');expect(i.fields.summary).toBe(summary);return i;};
  try{
   const meta=await get('/rest/api/3/issue/createmeta/WFH/issuetypes');expect(meta.issueTypes.find((t:any)=>t.id==='10000')).toMatchObject({hierarchyLevel:1,name:'Epic'});
   // One create request, no automatic create retry after an uncertain response.
   journal.phase='epic-create-requested';retain();
   const response=await fetch(`${BASE}/rest/api/3/issue`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${requireEnv('JIRA_ADMIN_EMAIL')}:${requireEnv('JIRA_API_TOKEN')}`).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({fields:{project:{key:'WFH'},issuetype:{id:'10000'},summary,customfield_10011:name}})});
   expect(response.status).toBe(201);journal.epic=await response.json();journal.phase='epic-created';retain();await ownEpic();
   await f.read(member);await put(`/rest/api/3/issue/${member}`,{fields:{parent:{key:journal.epic.key}}});
   expect((await get(`/rest/api/3/issue/${member}?fields=parent`)).fields.parent.key).toBe(journal.epic.key);
   // Jira search and Forge asApp indexing can converge independently. Assert the
   // actual parent and complete membership before any forecast is accepted.
   const keys=[...f.keys,journal.epic.key].sort(),jql=`key IN (${keys.join(',')}) ORDER BY key`;
   await expect.poll(async()=>{const r=await post('/rest/api/3/search/jql',{jql,maxResults:100,fields:['parent']});return {keys:r.issues.map((i:any)=>i.key).sort(),parent:r.issues.find((i:any)=>i.key===member)?.fields.parent?.key};},{timeout:90000}).toEqual({keys,parent:journal.epic.key});
   const created=await getTestState('lz-ppm',{what:'createFixture',name,jql});journal.planId=created.planId;retain();
   let indexed:any;
   await expect.poll(async()=>{await getTestState('lz-ppm',{what:'refreshPlan',planId:journal.planId});indexed=await getTestState('lz-ppm',{what:'plan',planId:journal.planId});return {keys:indexed.issues.map((i:any)=>i.key).sort(),parent:indexed.issues.find((i:any)=>i.key===member)?.parentKey};},{timeout:90000}).toEqual({keys,parent:journal.epic.key});
   expect(indexed.issues.find((i:any)=>i.key===member).predecessors).toContain(pred);
   expect(indexed.issues.find((i:any)=>i.key===pred).parentKey||null).toBe(null);expect(indexed.issues.find((i:any)=>i.key===late).parentKey||null).toBe(null);
   journal.indexedHierarchy=indexed.issues.map((i:any)=>({key:i.key,id:i.id,parentKey:i.parentKey,hierarchyLevel:i.hierarchyLevel,predecessors:i.predecessors}));retain();
   rpc=currentUserResolver(page,c=>c?.functionKey==='getTargets'&&c.payload?.planId===journal.planId);
   let frame=await table(page,name),work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();
   let panel=frame.locator('[data-testid="targets-editor"]');await panel.getByRole('button',{name:'Add target',exact:true}).click();let form=panel.locator('form');
   await form.getByRole('textbox',{name:'Target name',exact:true}).fill('Epic commitment');await chooseDate(frame,form,'Target date','2026-03-20');await form.getByRole('combobox').click();await frame.getByRole('option',{name:`Epic · ${journal.epic.key} ${summary}`,exact:true}).click();await expect(form).toContainText('1 current leaf tasks');await form.getByRole('button',{name:'Save target',exact:true}).click();await expect(form).toHaveCount(0);
   let data=await rpc.invoke('getTargets',{planId:journal.planId});expect(data.success).toBe(true);const target=data.targets.find((t:any)=>t.name==='Epic commitment');expect(target.scope).toEqual({type:'epic',id:String(journal.epic.id),memberKeys:[member]});
   await frame.getByRole('button',{name:/^Dashboard/i}).first().click();let confidence=frame.locator('[data-testid="schedule-confidence"]');let targetRow=confidence.locator('[data-testid="sc-milestone"]').filter({hasText:target.name});await expect(targetRow).toHaveAttribute('data-probability','1');await expect(targetRow).toContainText(journal.epic.key);await expect(confidence).toHaveAttribute('data-leaves','3');
   const sensitivity=frame.locator('[data-testid="finish-sensitivity"]');await sensitivity.getByRole('combobox').click();await sensitivity.getByRole('option',{name:target.name,exact:true}).click();await sensitivity.getByRole('button',{name:'Test finish sensitivity',exact:true}).click();await expect(sensitivity).toContainText('settled finish 2026-03-13');await sensitivity.getByRole('button',{name:'Show all tested tasks',exact:true}).click();await expect(sensitivity.locator('[data-testid="finish-effect"]')).toHaveCount(3);
   const outside=sensitivity.locator(`[data-testid="finish-effect"][data-key="${pred}"]`);await expect(outside.locator('td').nth(0)).toHaveText('2026-03-12 (1 calendar days earlier)');await expect(outside.locator('td').nth(1)).toHaveText('2026-03-16 (3 calendar days later)');
   const unrelated=sensitivity.locator(`[data-testid="finish-effect"][data-key="${late}"]`);for(const td of await unrelated.locator('td').all())await expect(td).toContainText('2026-03-13 (0 calendar days');await expect(sensitivity.locator(`[data-key="${journal.epic.key}"]`)).toHaveCount(0);
   await settledScreenshot(sensitivity,{path:info.outputPath('epic-outside-predecessor-exact-influence.png')});journal.exactInfluence=true;retain();
   // Start a fresh real simulation, freeze at its own yield, then edit the
   // commitment through the actual Targets UI while that old work is pending.
   await planning(frame);release=await holdForecastYield(frame.locator('body'));await frame.getByRole('button',{name:/^Dashboard/i}).first().click();
   await expect.poll(()=>frame.locator('body').evaluate((el:any)=>el.ownerDocument.defaultView.__lzEpicYield.pending.size),{timeout:15000}).toBeGreaterThan(0);await expect(confidence).toHaveAttribute('data-runs','');await expect(confidence.locator('[data-testid="sc-milestone"]')).toHaveCount(0);
   work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();panel=frame.locator('[data-testid="targets-editor"]');await panel.locator(`[data-target-id="${target.id}"]`).getByRole('button',{name:'Edit',exact:true}).click();form=panel.locator('form');await chooseDate(frame,form,'Target date','2026-03-01');await form.getByRole('button',{name:'Save target',exact:true}).click();await expect(form).toHaveCount(0);await release();release=null;
   data=await rpc.invoke('getTargets',{planId:journal.planId});expect(data.targets).toEqual([{...target,date:'2026-03-01'}]);
   await frame.getByRole('button',{name:/^Dashboard/i}).first().click();await expect(targetRow).toHaveAttribute('data-probability','0');await expect(targetRow).toContainText('Mar 1');await expect(confidence).toHaveAttribute('data-runs','300');await settledScreenshot(confidence,{path:info.outputPath('epic-edited-target-after-old-yield.png')});
   frame=await table(page,name);work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();await expect(frame.locator(`[data-target-id="${target.id}"]`)).toContainText('2026-03-01');expect((await rpc.invoke('getTargets',{planId:journal.planId})).targets).toEqual([{...target,date:'2026-03-01'}]);
   expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(source);expect((await get(`/rest/api/3/issue/${member}?fields=parent`)).fields.parent.key).toBe(journal.epic.key);journal.targetAfter={...target,date:'2026-03-01'};journal.sourceDatesUnchanged=true;journal.phase='verified';retain();
  }finally{
   if(release)await release().catch(()=>{});rpc?.stop();if(!page.isClosed())await page.goto('about:blank').catch(()=>{});
   if(!journal.planId)journal.planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;
   if(journal.planId){await getTestState('lz-ppm',{what:'clearDrafts',planId:journal.planId});await getTestState('lz-ppm',{what:'deleteFixture',planId:journal.planId});journal.planDeleted=true;retain();}
   if(journal.epic){await ownEpic();await f.read(member);const parent=(await get(`/rest/api/3/issue/${member}?fields=parent`)).fields.parent;if(parent){expect(parent.key).toBe(journal.epic.key);await put(`/rest/api/3/issue/${member}`,{fields:{parent:null}});expect((await get(`/rest/api/3/issue/${member}?fields=parent`)).fields.parent||null).toBe(null);}await request('DELETE',`/rest/api/3/issue/${journal.epic.key}`);expect((await request('GET',`/rest/api/3/issue/${journal.epic.key}`,{raw:true})).status).toBe(404);journal.epicDeleted=true;retain();}
   else if(journal.phase==='epic-create-requested')throw Error(`Uncertain epic create; reconcile exact owned summary before retry: ${summary}`);
  }
 },[[0,1]]);
});
