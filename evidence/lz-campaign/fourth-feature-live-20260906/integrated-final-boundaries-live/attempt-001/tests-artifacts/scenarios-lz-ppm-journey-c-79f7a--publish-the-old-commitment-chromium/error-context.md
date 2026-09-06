# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-epic-targets.spec.ts >> epic targets: actual hierarchy retains outside predecessor influence; target edit during a yielded forecast cannot publish the old commitment
- Location: scenarios/lz-ppm/journey-campaign-epic-targets.spec.ts:19:1

# Error details

```
AggregateError: Epic target test and/or owned cleanup failed; original evidence retained
```

```
TypeError: Cannot read properties of undefined (reading 'parent')
```

# Test source

```ts
  1  | import fs from 'node:fs';
  2  | import {test,expect} from '../../fixtures/forge';
  3  | import {get,post,put,request,BASE} from '../../data/jira.mjs';
  4  | import {requireEnv} from '../../data/env.mjs';
  5  | import {getTestState} from '../../testhook/client';
  6  | import {withOwnedSchedule,table} from './normalization-owned-fixture';
  7  | import {planning,chooseDate,currentUserResolver,actualResponse} from './campaign-ui';
  8  | import {settledScreenshot} from './settled-screenshot.mjs';
  9  | 
  10 | test.describe.configure({retries:0,timeout:900000});
  11 | 
  12 | // Hold only actual zero-delay yields. Restore and deliver the original callbacks;
  13 | // no clock, source issue, resolver reply, simulation result or DOM is replaced.
  14 | async function holdForecastYield(body:any){
  15 |  await body.evaluate((el:any)=>{const w=el.ownerDocument.defaultView;if(w.__lzEpicYield)throw Error('Existing timer instrument');const set=w.setTimeout,clear=w.clearTimeout,pending=new Map();w.__lzEpicYield={set,clear,pending};w.setTimeout=function(fn:any,delay:any,...args:any[]){if(delay===0&&typeof fn==='function'){const id=set.call(w,()=>{},86400000);pending.set(id,{fn,args});return id;}return set.call(w,fn,delay,...args);};w.clearTimeout=function(id:any){pending.delete(id);return clear.call(w,id);};});
  16 |  return ()=>body.evaluate((el:any)=>{const w=el.ownerDocument.defaultView,h=w.__lzEpicYield;if(!h)return;w.setTimeout=h.set;w.clearTimeout=h.clear;delete w.__lzEpicYield;for(const[id,c]of h.pending){h.clear.call(w,id);h.set.call(w,c.fn,0,...c.args);}});
  17 | }
  18 | 
  19 | test('epic targets: actual hierarchy retains outside predecessor influence; target edit during a yielded forecast cannot publish the old commitment',async({page},info)=>{
  20 |  await withOwnedSchedule(page,info,[
  21 |   {label:'outside epic predecessor',duration:5,start:'2026-03-02',due:'2026-03-06'},
  22 |   {label:'epic child',duration:5,start:'2026-03-09',due:'2026-03-13'},
  23 |   {label:'unrelated December work',duration:5,start:'2026-12-07',due:'2026-12-11'},
  24 |  ],async(f)=>{
  25 |   expect(BASE).toBe('https://wolfaenpak.atlassian.net');
  26 |   const[pred,member,late]=f.keys,source=await Promise.all(f.keys.map((key:string)=>f.read(key)));
  27 |   const name=`${f.name} Epic target`,summary=`${name} owned parent`;
  28 |   const journal:any={name,summary,source,phase:'before-owned-epic',epic:null,planId:null};
  29 |   const retain=()=>fs.writeFileSync(info.outputPath('epic-target-journal.json'),JSON.stringify(journal,null,2));retain();
  30 |   let rpc:any,release:any,editorPage:any,testFailure:any;
  31 |   const ownEpic=async()=>{const i=await get(`/rest/api/3/issue/${journal.epic.key}?fields=project,issuetype,summary`);expect(i.id).toBe(journal.epic.id);expect(i.fields.project.key).toBe('WFH');expect(i.fields.issuetype.id).toBe('10000');expect(i.fields.summary).toBe(summary);return i;};
  32 |   try{
  33 |    const meta=await get('/rest/api/3/issue/createmeta/WFH/issuetypes');expect(meta.issueTypes.find((t:any)=>t.id==='10000')).toMatchObject({hierarchyLevel:1,name:'Epic'});
  34 |    // One create request, no automatic create retry after an uncertain response.
  35 |    journal.phase='epic-create-requested';retain();
  36 |    const response=await fetch(`${BASE}/rest/api/3/issue`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${requireEnv('JIRA_ADMIN_EMAIL')}:${requireEnv('JIRA_API_TOKEN')}`).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({fields:{project:{key:'WFH'},issuetype:{id:'10000'},summary,customfield_10011:name}})});
  37 |    journal.createStatus=response.status;journal.createBody=await response.text();if(response.status>=400&&response.status<500)journal.phase='epic-create-rejected';retain();expect(response.status).toBe(201);journal.epic=JSON.parse(journal.createBody);expect(journal.epic.id).toBeTruthy();expect(journal.epic.key).toBeTruthy();journal.phase='epic-created';retain();await ownEpic();
  38 |    await f.read(member);await put(`/rest/api/3/issue/${member}`,{fields:{parent:{key:journal.epic.key}}});
  39 |    expect((await get(`/rest/api/3/issue/${member}?fields=parent`)).fields.parent.key).toBe(journal.epic.key);
  40 |    // Jira search and Forge asApp indexing can converge independently. Assert the
  41 |    // actual parent and complete membership before any forecast is accepted.
  42 |    const keys=[...f.keys,journal.epic.key].sort(),jql=`key IN (${keys.join(',')}) ORDER BY key`;
  43 |    await expect.poll(async()=>{const r=await post('/rest/api/3/search/jql',{jql,maxResults:100,fields:['parent']});return {keys:r.issues.map((i:any)=>i.key).sort(),parent:r.issues.find((i:any)=>i.key===member)?.fields.parent?.key};},{timeout:90000}).toEqual({keys,parent:journal.epic.key});
  44 |    const created=await getTestState('lz-ppm',{what:'createFixture',name,jql});journal.planId=created.planId;retain();
  45 |    let indexed:any;
  46 |    await expect.poll(async()=>{await getTestState('lz-ppm',{what:'refreshPlan',planId:journal.planId});indexed=await getTestState('lz-ppm',{what:'plan',planId:journal.planId});return {keys:indexed.issues.map((i:any)=>i.key).sort(),parent:indexed.issues.find((i:any)=>i.key===member)?.parentKey};},{timeout:90000}).toEqual({keys,parent:journal.epic.key});
  47 |    expect(indexed.issues.find((i:any)=>i.key===member).predecessors).toContain(pred);
  48 |    expect(indexed.issues.find((i:any)=>i.key===pred).parentKey||null).toBe(null);expect(indexed.issues.find((i:any)=>i.key===late).parentKey||null).toBe(null);
  49 |    journal.indexedHierarchy=indexed.issues.map((i:any)=>({key:i.key,id:i.id,parentKey:i.parentKey,hierarchyLevel:i.hierarchyLevel,predecessors:i.predecessors}));retain();
  50 |    rpc=currentUserResolver(page,c=>c?.functionKey==='getTargets'&&c.payload?.planId===journal.planId);
  51 |    let frame=await table(page,name),work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();
  52 |    let panel=frame.locator('[data-testid="targets-editor"]');await panel.getByRole('button',{name:'Add target',exact:true}).click();let form=panel.locator('form');
  53 |    await form.getByRole('textbox',{name:'Target name',exact:true}).fill('Epic commitment');await chooseDate(frame,form,'Target date','2026-03-20');await form.getByRole('combobox').click();await frame.getByRole('option',{name:`Epic · ${journal.epic.key} ${summary}`,exact:true}).click();await expect(form).toContainText('1 current leaf tasks');await form.getByRole('button',{name:'Save target',exact:true}).click();await expect(form).toHaveCount(0);
  54 |    let data=await rpc.invoke('getTargets',{planId:journal.planId});expect(data.success).toBe(true);const target=data.targets.find((t:any)=>t.name==='Epic commitment');expect(target.scope).toEqual({type:'epic',id:String(journal.epic.id),memberKeys:[member]});
  55 |    await frame.getByRole('button',{name:/^Dashboard/i}).first().click();let confidence=frame.locator('[data-testid="schedule-confidence"]');let targetRow=confidence.locator('[data-testid="sc-milestone"]').filter({hasText:target.name});await expect(targetRow).toHaveAttribute('data-probability','1');await expect(targetRow).toContainText(journal.epic.key);await expect(confidence).toHaveAttribute('data-leaves','3');
  56 |    const sensitivity=frame.locator('[data-testid="finish-sensitivity"]');await sensitivity.getByRole('combobox').click();await sensitivity.getByRole('option',{name:target.name,exact:true}).click();await sensitivity.getByRole('button',{name:'Test finish sensitivity',exact:true}).click();await expect(sensitivity).toContainText('settled finish 2026-03-13');await sensitivity.getByRole('button',{name:'Show all tested tasks',exact:true}).click();await expect(sensitivity.locator('[data-testid="finish-effect"]')).toHaveCount(3);
  57 |    const outside=sensitivity.locator(`[data-testid="finish-effect"][data-key="${pred}"]`);await expect(outside.locator('td').nth(0)).toHaveText('2026-03-12 (1 calendar days earlier)');await expect(outside.locator('td').nth(1)).toHaveText('2026-03-16 (3 calendar days later)');
  58 |    const unrelated=sensitivity.locator(`[data-testid="finish-effect"][data-key="${late}"]`);for(const td of await unrelated.locator('td').all())await expect(td).toContainText('2026-03-13 (0 calendar days');await expect(sensitivity.locator(`[data-key="${journal.epic.key}"]`)).toHaveCount(0);
  59 |    await settledScreenshot(sensitivity,{path:info.outputPath('epic-outside-predecessor-exact-influence.png')});journal.exactInfluence=true;retain();
  60 |    // The primary Dashboard stays mounted while a second real page of the
  61 |    // SAME account edits the target. Re-index from that page delivers actual
  62 |    // metadata to the primary via its existing realtime path, not injected props.
  63 |    editorPage=await page.context().newPage();const editorFrame=await table(editorPage,name);const editorWork=await planning(editorFrame);await editorWork.getByRole('button',{name:'Targets',exact:true}).click();const editorPanel=editorFrame.locator('[data-testid="targets-editor"]');
  64 |    await planning(frame);release=await holdForecastYield(frame.locator('body'));await frame.getByRole('button',{name:/^Dashboard/i}).first().click();
  65 |    await expect.poll(()=>frame.locator('body').evaluate((el:any)=>el.ownerDocument.defaultView.__lzEpicYield.pending.size),{timeout:15000}).toBeGreaterThan(0);await expect(confidence).toHaveAttribute('data-runs','');await expect(confidence.locator('[data-testid="sc-milestone"]')).toHaveCount(0);
  66 |    // Real first slice progress distinguishes forecast execution from an unrelated
  67 |    // zero-delay callback. Thirty of three hundred runs have completed before yield.
  68 |    await expect(confidence.locator('[data-testid="schedule-confidence-progress"] > div')).toHaveAttribute('style',/width: 10%/);
  69 |    const mountedForecast=await confidence.elementHandle();expect(mountedForecast).toBeTruthy();
  70 |    await editorPanel.locator(`[data-target-id="${target.id}"]`).getByRole('button',{name:'Edit',exact:true}).click();const editorForm=editorPanel.locator('form');await chooseDate(editorFrame,editorForm,'Target date','2026-03-01');await editorForm.getByRole('button',{name:'Save target',exact:true}).click();await expect(editorForm).toHaveCount(0);
  71 |    data=await rpc.invoke('getTargets',{planId:journal.planId});expect(data.targets).toEqual([{...target,date:'2026-03-01'}]);
  72 |    const metadata=actualResponse(page,'getPlan',journal.planId);await editorFrame.getByRole('button',{name:'Re-index',exact:true}).click();const {coverage:_coverage,...storedTarget}=target;expect((await metadata).plan.milestones).toEqual([{...storedTarget,date:'2026-03-01'}]);
  73 |    expect(await mountedForecast!.evaluate((el:any)=>el.isConnected)).toBe(true);await expect(confidence).toHaveAttribute('data-runs','');await expect(confidence.locator('[data-testid="sc-milestone"]')).toHaveCount(0);journal.forecastRemainedMounted=true;retain();
  74 |    await release();release=null;await expect(targetRow).toHaveAttribute('data-probability','0');await expect(targetRow).toContainText('Mar 1');await expect(confidence).toHaveAttribute('data-runs','300');await settledScreenshot(confidence,{path:info.outputPath('epic-edited-target-after-old-yield.png')});await editorPage.close();editorPage=null;
  75 |    frame=await table(page,name);work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();await expect(frame.locator(`[data-target-id="${target.id}"]`)).toContainText('2026-03-01');expect((await rpc.invoke('getTargets',{planId:journal.planId})).targets).toEqual([{...target,date:'2026-03-01'}]);
  76 |    expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(source);expect((await get(`/rest/api/3/issue/${member}?fields=parent`)).fields.parent.key).toBe(journal.epic.key);journal.targetAfter={...target,date:'2026-03-01'};journal.sourceDatesUnchanged=true;journal.phase='verified';retain();
  77 |   }catch(error){testFailure=error;journal.failure=String(error);retain();throw error;
  78 |   }finally{
  79 |    const cleanupErrors:any[]=[];journal.cleanup=[];
  80 |    const clean=async(label:string,action:()=>Promise<void>)=>{try{await action();journal.cleanup.push({label,ok:true});}catch(error){cleanupErrors.push(error);journal.cleanup.push({label,ok:false,error:String(error)});}retain();};
  81 |    await clean('restore primary timer',async()=>{if(release)await release();});await clean('close owned editor',async()=>{if(editorPage&&!editorPage.isClosed())await editorPage.close();});rpc?.stop();
  82 |    await clean('leave primary UI',async()=>{if(!page.isClosed())await page.goto('about:blank');});
  83 |    await clean('identify owned plan',async()=>{if(!journal.planId)journal.planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;});
  84 |    if(journal.planId){
  85 |     await clean('clear owned plan draft',async()=>{await getTestState('lz-ppm',{what:'clearDrafts',planId:journal.planId});});
  86 |     await clean('delete owned plan',async()=>{const result=await getTestState('lz-ppm',{what:'deleteFixture',planId:journal.planId});expect(result).toEqual({deleted:journal.planId,registryRemoved:true});journal.planDeleted=true;});
  87 |    }
  88 |    if(journal.epic){
> 89 |     await clean('detach owned child',async()=>{await ownEpic();await f.read(member);const parent=(await get(`/rest/api/3/issue/${member}?fields=parent`)).fields.parent;if(parent){expect(parent.key).toBe(journal.epic.key);await put(`/rest/api/3/issue/${member}`,{fields:{parent:null}});expect((await get(`/rest/api/3/issue/${member}?fields=parent`)).fields.parent||null).toBe(null);}});
     |                                                                                                                                                                                                                                                                                                                                                                     ^ TypeError: Cannot read properties of undefined (reading 'parent')
  90 |     await clean('delete owned epic',async()=>{await ownEpic();await request('DELETE',`/rest/api/3/issue/${journal.epic.key}`);expect((await request('GET',`/rest/api/3/issue/${journal.epic.key}`,{raw:true})).status).toBe(404);journal.epicDeleted=true;});
  91 |    }else if(journal.phase==='epic-create-requested')cleanupErrors.push(Error(`Uncertain epic create; reconcile exact owned summary before retry: ${summary}`));
  92 |    if(cleanupErrors.length)throw new AggregateError([...(testFailure?[testFailure]:[]),...cleanupErrors],'Epic target test and/or owned cleanup failed; original evidence retained');
  93 |   }
  94 |  },[[0,1]]);
  95 | });
  96 | 
```