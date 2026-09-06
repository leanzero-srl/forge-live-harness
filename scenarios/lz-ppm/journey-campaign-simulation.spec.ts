import {settledScreenshot} from './settled-screenshot.mjs';
import {replayHeaders} from './replay-headers.mjs';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {test, expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {get} from '../../data/jira.mjs';
import {withOwnedSchedule, table, row} from './normalization-owned-fixture';
import {openPlans, scheduleFields} from './forecast-fixture';

test.describe.configure({retries:0, timeout:900000});
function envelope(req:any) {
  try {
    let raw=req.postDataBuffer(); if (!raw) return null;
    if (raw[0]===31 && raw[1]===139) raw=gunzipSync(raw);
    return JSON.parse(raw.toString());
  } catch { return null; }
}
const rpcBody=async(res:any)=>(await res.json()).data?.invokeExtension?.response?.body;
function response(page:any, name:string, planId:string) {
  return page.waitForResponse((res:any)=>{
    const call=envelope(res.request())?.variables?.input?.payload?.call;
    return call?.functionKey===name && call.payload?.planId===planId;
  },{timeout:120000}).then(async(res:any)=>{
    expect(res.status()).toBe(200); await res.finished();
    const body=await rpcBody(res); expect(body.success).toBe(true); return body;
  });
}
async function planning(frame:any) {
  await frame.getByRole('button',{name:/^Planning/i}).first().click();
  await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  return frame.locator('[data-testid="planning-workspace"]');
}
const modelRows=(model:any)=>model.issues.map((issue:any)=>({
  key:issue.key,start:issue.startDate,due:issue.dueDate,duration:issue.duration,
  predecessors:issue.predecessors||[],predecessorLags:issue.predecessorLags||{},
})).sort((a:any,b:any)=>a.key.localeCompare(b.key));

// Genuine Jira fixture + real UI. RPC replay below keeps the captured current-user
// identity and real backend responses; it is used for readback, explicit negative
// boundary probes, and failure cleanup. No result or app state is mocked.
test('private simulation: scope, holiday and lag survive model save/reopen; excluded task can return without changing Jira or capture',async({page},info)=>{
  await withOwnedSchedule(page,info,[
    {label:'simulation predecessor',duration:5,start:'2026-03-02',due:'2026-03-06'},
    {label:'simulation successor',duration:5,start:'2026-03-09',due:'2026-03-13'},
    {label:'simulation independent December',duration:5,start:'2026-12-07',due:'2026-12-11'},
  ],async(f)=>{
    const [pred,succ,late]=f.keys;
    const sourceBefore=await getTestState('lz-ppm',{what:'plan',planId:f.planId});
    const jiraBefore=await Promise.all(f.keys.map((key:string)=>f.read(key)));
    const jiraLinks=async()=>Promise.all(f.keys.map(async(key:string)=>{
      await f.read(key); // Positive owned-key and project control before this read.
      const actual=await get(`/rest/api/3/issue/${key}?fields=issuelinks`);
      return {key,links:actual.fields.issuelinks.map((link:any)=>({id:link.id,type:link.type.id,
        inward:link.inwardIssue?.key||null,outward:link.outwardIssue?.key||null})).sort((a:any,b:any)=>a.id.localeCompare(b.id))};
    }));
    const jiraLinksBefore=await jiraLinks();
    let simId:string|undefined, wire:any, deleted=false;
    const simName=f.name+' private simulation';
    const journal:any={sourcePlanId:f.planId,simName,keys:f.keys,steps:[],cleanup:{}};
    const retain=()=>fs.writeFileSync(info.outputPath('simulation-journal.json'),JSON.stringify(journal,null,2));
    const capture=(req:any)=>{
      const data=envelope(req), call=data?.variables?.input?.payload?.call;
      if (call?.functionKey==='forkSimulationPlan' && call.payload?.planId===f.planId) {
        // Header promise stays in memory. Never serialize headers, identity
        // context or the whole transport envelope.
        wire={url:req.url(),headers:req.allHeaders(),data};
      }
    };
    page.on('request',capture); retain();
    const invoke=async(name:string,payload:any)=>{
      expect(wire,'real current-user envelope observed during this owned fork').toBeTruthy();
      const data=structuredClone(wire.data); data.variables.input.payload.call={functionKey:name,payload};
      const headers=replayHeaders(await wire.headers);
      const res=await page.request.post(wire.url,{headers,data:JSON.stringify(data)});
      expect(res.status()).toBe(200); const body=await rpcBody(res); expect(body).toBeTruthy(); return body;
    };
    try {
      let frame=await table(page,f.name), work=await planning(frame);
      const captured=response(page,'getSnapshot',f.planId);
      await work.getByLabel('Capture name',{exact:true}).fill('Simulation source capture');
      await work.getByRole('button',{name:'Capture working plan',exact:true}).click();
      const base=(await captured).snapshot;
      expect(base.issues.map((i:any)=>i.key).sort()).toEqual([...f.keys].sort());
      expect(base.issues.find((i:any)=>i.key===succ).predecessors).toEqual([pred]);
      journal.base={id:base.id,hash:base.hash,rows:modelRows(base),calendar:base.calendar}; retain();
      await work.getByRole('button',{name:'Open as private simulation…',exact:true}).click();
      const fork=work.locator('[data-testid="simulation-fork"]');
      await fork.getByLabel('Simulation plan name',{exact:true}).fill(simName);
      const made=response(page,'forkSimulationPlan',f.planId);
      await fork.getByRole('button',{name:'Create private simulation',exact:true}).click();
      const plan=(await made).plan; simId=plan.id; journal.simId=simId; retain();
      expect(plan).toMatchObject({name:simName,mode:'simulation',sources:[],defaultAccess:'none',protectionEnabled:false,issueCount:3});
      expect(plan.simulationProvenance).toMatchObject({sourcePlanId:f.planId,snapshotId:base.id,snapshotHash:base.hash});
      await expect(frame.locator('[data-testid="simulation-plan-banner"]')).toBeVisible();
      await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveCount(0);
      await expect(frame.getByRole('button',{name:'Re-index',exact:true})).toHaveCount(0);
      await expect(frame.getByRole('button',{name:/^Apply \d+ change/})).toHaveCount(0);
      work=await planning(frame);
      let loaded=response(page,'getSimulationModel',simId!);
      await work.getByRole('button',{name:'Edit simulation',exact:true}).click();
      const initial=await loaded;
      expect(modelRows(initial.model)).toEqual(modelRows(base));
      expect(modelRows(initial.scopeBasis)).toEqual(modelRows(base));
      let editor=work.locator('[data-testid="scenario-editor"]');
      // Calendar-only edit must preserve declared work. The source dates contain
      // five old-calendar workdays; the added holiday moves finish, not duration.
      await editor.getByRole('textbox',{name:'Holiday dates, one YYYY-MM-DD per line',exact:true}).fill('2026-03-04');
      await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
      let calendarPreview=editor.locator('[data-testid="scenario-preview"]');
      const calendarPred=calendarPreview.locator('tbody tr').filter({hasText:pred}).locator('td');
      await expect(calendarPred.nth(1)).toHaveText('2026-03-02');
      await expect(calendarPred.nth(2)).toHaveText('2026-03-09');
      await expect(calendarPred.nth(3)).toHaveText('5');
      await settledScreenshot(calendarPreview,{path:info.outputPath('simulation-calendar-only-five-days.png')});
      loaded=response(page,'getSimulationModel',simId!);
      await editor.getByRole('button',{name:'Save simulation',exact:true}).click();
      const calendarOnly=await loaded;
      expect(calendarOnly.model.issues.find((i:any)=>i.key===pred)).toMatchObject({duration:5,startDate:'2026-03-02',dueDate:'2026-03-09'});
      expect(calendarOnly.model.issues.find((i:any)=>i.key===succ)).toMatchObject({duration:5,startDate:'2026-03-10',dueDate:'2026-03-16'});
      journal.steps.push({name:'calendar-only-preserves-five-days',version:calendarOnly.version,rows:modelRows(calendarOnly.model)}); retain();
      // Reload of the saved model remounts the editor with the new generation.
      await expect(editor.getByLabel(`${pred} duration`,{exact:true})).toHaveValue('5');
      await expect(editor.getByRole('button',{name:'Save simulation',exact:true})).toBeDisabled();
      await editor.getByRole('checkbox',{name:`Include ${late}`,exact:true}).click();
      await editor.getByLabel(`${pred} duration`,{exact:true}).fill('6');
      await editor.getByRole('textbox',{name:'Holiday dates, one YYYY-MM-DD per line',exact:true}).fill('2026-03-04');
      await editor.locator('summary').filter({hasText:'Edit finish-to-start dependencies'}).click();
      const details=editor.locator('details');
      await details.locator('label').filter({hasText:'Predecessor'}).getByRole('combobox').click();
      await details.getByRole('option').filter({hasText:pred}).click();
      await details.locator('label').filter({hasText:'Successor'}).getByRole('combobox').click();
      await details.getByRole('option').filter({hasText:succ}).click();
      await details.getByLabel('Dependency lag',{exact:true}).fill('2');
      await details.getByRole('button',{name:'Set dependency',exact:true}).click();
      await expect(editor.getByRole('button',{name:'Save simulation',exact:true})).toBeDisabled();
      await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
      const preview=editor.locator('[data-testid="scenario-preview"]');
      // Independent inclusive calendar oracle: predecessor Mar 2,3,5,6,9,10;
      // two lag days Mar 11,12; successor Mar 13,16,17,18,19.
      const expected=[
        {key:pred,start:'2026-03-02',due:'2026-03-10',duration:6,predecessors:[],predecessorLags:{}},
        {key:succ,start:'2026-03-13',due:'2026-03-19',duration:5,predecessors:[pred],predecessorLags:{[pred]:2}},
      ].sort((a,b)=>a.key.localeCompare(b.key));
      await expect(preview.locator('tbody tr')).toHaveCount(2);
      for (const item of expected) {
        const cells=preview.locator('tbody tr').filter({hasText:item.key}).locator('td');
        await expect(cells.nth(1)).toHaveText(item.start); await expect(cells.nth(2)).toHaveText(item.due);
        await expect(cells.nth(3)).toHaveText(String(item.duration));
      }
      await settledScreenshot(preview,{path:info.outputPath('simulation-scope-holiday-lag-preview.png')});
      loaded=response(page,'getSimulationModel',simId!);
      await editor.getByRole('button',{name:'Save simulation',exact:true}).click();
      const saved=await loaded;
      expect(modelRows(saved.model)).toEqual(expected); expect(saved.version).toBeGreaterThan(initial.version);
      expect(saved.model.calendar.holidays).toEqual([{date:'2026-03-04',name:''}]);
      expect(modelRows(saved.scopeBasis)).toEqual(modelRows(base));
      await expect(work).toContainText('Simulation saved. Gantt, Table and Dashboard now use this model.');
      journal.steps.push({name:'scope-holiday-lag-saved',version:saved.version,rows:modelRows(saved.model),calendar:saved.model.calendar}); retain();

      // Fresh navigation, then visible Table, Gantt and Dashboard must consume the
      // same saved generation; API metadata by itself is insufficient evidence.
      frame=await table(page,simName);
      await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(2);
      for (const item of expected) {
        await expect(row(frame,item.key)).toHaveAttribute('data-row-start',item.start);
        await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);
        await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));
      }
      await settledScreenshot(page,{subject:row(frame,pred),path:info.outputPath('simulation-table-reopen.png')});
      await frame.getByRole('button',{name:/^Gantt/i}).first().click();
      await expect(frame.locator('[data-testid="gantt-bar"]')).toHaveCount(2);
      for (const key of [pred,succ]) await expect(frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`)).toBeVisible();
      await expect(frame.locator('[data-testid="gantt-dep-arrows"] .dep-arrow-line')).toHaveCount(1);
      await settledScreenshot(page,{subject:frame.locator(`[data-testid="gantt-row"][data-row-key="${pred}"]`),path:info.outputPath('simulation-gantt-reopen.png')});
      await frame.getByRole('button',{name:/^Dashboard/i}).first().click();
      const confidence=frame.locator('[data-testid="schedule-confidence"]');
      await expect(confidence).toHaveAttribute('data-leaves','2');
      await expect(confidence).toHaveAttribute('data-runs','300');
      await expect(confidence.locator('[data-testid="sc-planned"]')).toContainText('Mar 19');
      await settledScreenshot(confidence,{path:info.outputPath('simulation-dashboard-reopen.png')});

      // Same authenticated owner is allowed to model but forbidden to sync,
      // replace sources, or share. These real denials do not prove AUTH-1.
      const beforeDenials=await invoke('getSimulationModel',{planId:simId});
      expect(beforeDenials.success).toBe(true);
      expect(beforeDenials.version).toBe(saved.version);
      expect(beforeDenials.model).toEqual(saved.model);
      expect(beforeDenials.scopeBasis).toEqual(saved.scopeBasis);
      for (const [name,payload] of [
        ['startWrite',{planId:simId}], ['indexPlan',{planId:simId}],
        ['updatePlan',{planId:simId,expectedVersion:beforeDenials.version,
          changes:{sources:[{type:'project',projectKey:'WFH'}]}}],
        ['updatePlanAccess',{planId:simId,defaultAccess:'edit'}],
      ] as const) {
        const denied=await invoke(name,payload); expect(denied.success).toBe(false);
        expect(denied.error).toContain('private simulation'); journal.steps.push({name,denied}); retain();
      }
      const afterDenials=await invoke('getSimulationModel',{planId:simId});
      expect(afterDenials.success).toBe(true);
      expect(afterDenials.version).toBe(beforeDenials.version);
      expect(afterDenials.model).toEqual(beforeDenials.model);
      expect(afterDenials.scopeBasis).toEqual(beforeDenials.scopeBasis);
      journal.steps.push({name:'all-four-denials-preserve-entire-model-and-scope',
        before:beforeDenials,after:afterDenials}); retain();
      const stale=await invoke('saveSimulationModel',{planId:simId,expectedVersion:initial.version,name:simName,
        selectedLeafKeys:[pred,succ],changes:[],calendar:saved.model.calendar,uncertainty:'medium',dependencyChanges:[]});
      expect(stale.success).toBe(false); expect(stale.error).toContain('Reload before saving');
      const unchanged=await invoke('getSimulationModel',{planId:simId});
      expect(unchanged.success).toBe(true); expect(unchanged.version).toBe(saved.version);
      expect(modelRows(unchanged.model)).toEqual(expected);
      journal.steps.push({name:'stale-version-rejected',error:stale.error}); retain();

      work=await planning(frame); loaded=response(page,'getSimulationModel',simId!);
      await work.getByRole('button',{name:'Edit simulation',exact:true}).click(); await loaded;
      editor=work.locator('[data-testid="scenario-editor"]');
      await expect(editor.getByRole('checkbox',{name:`Include ${late}`,exact:true})).toHaveAttribute('aria-checked','false');
      await editor.getByRole('checkbox',{name:`Include ${late}`,exact:true}).click();
      await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
      await expect(editor.locator('[data-testid="scenario-preview"] tbody tr')).toHaveCount(3);
      loaded=response(page,'getSimulationModel',simId!);
      await editor.getByRole('button',{name:'Save simulation',exact:true}).click(); const restored=await loaded;
      const restoredExpected=[...expected,modelRows(base).find((i:any)=>i.key===late)].sort((a,b)=>a.key.localeCompare(b.key));
      expect(modelRows(restored.model)).toEqual(restoredExpected);
      expect(restored.model.calendar).toEqual(saved.model.calendar);
      frame=await table(page,simName);
      await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(3);
      await expect(row(frame,late)).toHaveAttribute('data-row-start','2026-12-07');
      await expect(row(frame,late)).toHaveAttribute('data-row-due','2026-12-11');
      await expect(row(frame,pred)).toHaveAttribute('data-row-duration','6');
      const finalModel=await invoke('getSimulationModel',{planId:simId});
      expect(modelRows(finalModel.model)).toEqual(restoredExpected);
      expect(finalModel.model.calendar).toEqual(saved.model.calendar);
      await settledScreenshot(page,{subject:row(frame,late),path:info.outputPath('simulation-excluded-task-restored.png')});
      journal.steps.push({name:'excluded-task-restored-after-reopen',version:finalModel.version,rows:modelRows(finalModel.model)}); retain();
      const original=await invoke('getSnapshot',{planId:f.planId,snapshotId:base.id});
      expect(original.success).toBe(true); expect(original.snapshot.hash).toBe(base.hash);
      expect(original.snapshot.issues).toEqual(base.issues); expect(original.snapshot.calendar).toEqual(base.calendar);
      expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues)).toEqual(scheduleFields(sourceBefore.issues));
      expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(jiraBefore);
      expect(await jiraLinks()).toEqual(jiraLinksBefore);
      journal.sourceAndCaptureUnchanged=true; retain();

      frame=await openPlans(page);
      const card=frame.locator('.lz-card').filter({hasText:simName});
      await expect(card.locator('[data-testid="plan-card-simulation"]')).toHaveText('Private simulation');
      await card.getByRole('button',{name:'More',exact:true}).click();
      await card.getByRole('button',{name:'Delete plan',exact:true}).click();
      const removed=response(page,'deletePlan',simId!);
      await frame.getByRole('dialog',{name:'Delete Plan',exact:true}).getByRole('button',{name:'Delete',exact:true}).click();
      await removed; await expect(card).toHaveCount(0);
      expect((await getTestState('lz-ppm',{what:'plans'})).plans.some((p:any)=>p.id===simId)).toBe(false);
      deleted=true; journal.cleanup.uiDelete=true; retain();
    } finally {
      page.off('request',capture);
      // If a failure prevented receiving the fork response, recover only the
      // positively named owned simulation with its source provenance.
      const registry=(await getTestState('lz-ppm',{what:'plans'})).plans;
      const owned=registry.filter((p:any)=>p.name===simName && p.mode==='simulation');
      expect(owned.length).toBeLessThanOrEqual(1);
      if (!simId && owned.length) {simId=owned[0].id; journal.simId=simId; retain();}
      if (simId && !deleted) {
        const state=await getTestState('lz-ppm',{what:'plan',planId:simId});
        if (state.meta) {
          expect(state.meta).toMatchObject({name:simName,mode:'simulation',simulationProvenance:{sourcePlanId:f.planId}});
          const removed=await invoke('deletePlan',{planId:simId}); expect(removed.success).toBe(true);
          journal.cleanup.fallbackRealResolverDelete=true; retain();
        } else {
          expect(registry.some((p:any)=>p.id===simId)).toBe(false);
          journal.cleanup.metaAndRegistryAlreadyAbsent=true; retain();
        }
      }
      if (simId) expect((await getTestState('lz-ppm',{what:'plans'})).plans.some((p:any)=>p.id===simId)).toBe(false);
      journal.cleanup.simulationRegistryAbsent=true; retain();
    }
  },[[0,1]]);
});
