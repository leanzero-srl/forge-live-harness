# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-observations.spec.ts >> forecast outcomes: prospective numeric capture uses real later Jira resolution and excludes overlapping forecast samples
- Location: scenarios/lz-ppm/journey-campaign-observations.spec.ts:15:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="forecast-evaluation"]').getByRole('heading', { name: 'Prospective forecast one', exact: true }).locator('..').locator('[data-testid="forecast-outcome"]')
Expected substring: "Observed Jira resolution completion 2026-09-05 for 1 captured tasks. P80 hit."
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 15000ms
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="forecast-evaluation"]').getByRole('heading', { name: 'Prospective forecast one', exact: true }).locator('..').locator('[data-testid="forecast-outcome"]')

```

```yaml
- banner:
  - button "LeanZero Management home": LeanZero Management
  - navigation:
    - button "Plans"
    - button "Capacity"
  - text: Portfolio control · rev
  - strong: v4.58.575
- main:
  - button "Back to plans": ←
  - text: "[harness-test] lz-norm-mtorjgvy Ready 1 issue ?"
  - img
  - text: Standard (Mon-Fri)
  - button "JQL":
    - img
    - text: JQL
  - button "Gantt":
    - img
    - text: Gantt
  - button "Table":
    - img
    - text: Table
  - button "Dashboard":
    - img
    - text: Dashboard
  - button "Schedule":
    - img
    - text: Schedule
  - button "Planning"
  - button "Permissions":
    - img
    - text: Permissions
  - button "✦ Assess"
  - text: Live
  - button "Saved" [disabled]
  - button "Delete"
  - button "Re-index"
  - text: "?"
  - navigation "Planning views":
    - button "Scenarios & history"
    - button "Targets"
    - button "Forecast outcomes"
  - paragraph: Plan decisions
  - heading "Scenarios & history" [level=2]
  - paragraph: Capture an alternative, compare it with your working schedule, and keep a dated record of your decisions.
  - button "Refresh history"
  - text: Capture name
  - textbox "Capture name":
    - /placeholder: e.g. September commitment
  - text: Record type
  - combobox "Record type":
    - text: Scenario
    - img
  - text: Duration uncertainty
  - combobox "Duration uncertainty":
    - text: Medium
    - img
  - button "Capture working plan" [disabled]
  - text: Includes the complete indexed scope, working schedule edits, calendar, targets and selected uncertainty. Captures with the same name remain separate dated records.
  - navigation "Retained captures":
    - button "forecast Overlapping forecast two 9/5/2026, 10:15:58 PM 1 issues · revision 2":
      - text: forecast
      - strong: Overlapping forecast two
      - text: 9/5/2026, 10:15:58 PM 1 issues · revision 2
    - button "forecast Prospective forecast one 9/5/2026, 10:15:56 PM 1 issues · revision 2":
      - text: forecast
      - strong: Prospective forecast one
      - text: 9/5/2026, 10:15:56 PM 1 issues · revision 2
  - paragraph: Select a capture to inspect its schedule and compare changes.
```

# Test source

```ts
  1  | import fs from 'node:fs';
  2  | import {gunzipSync} from 'node:zlib';
  3  | import {test,expect} from '../../fixtures/forge';
  4  | import {withOwnedSchedule,table} from './normalization-owned-fixture';
  5  | import {openPlan} from './forecast-fixture';
  6  | // @ts-ignore Actual owned Jira fixture status transitions, never simulated outcomes.
  7  | import {get,post} from '../../data/jira.mjs';
  8  | test.describe.configure({retries:0,timeout:900000});
  9  | const call=(req:any)=>{try{let raw=req.postDataBuffer();if(raw?.[0]===31&&raw?.[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString()).variables?.input?.payload?.call;}catch{return null;}};
  10 | const result=(page:any,name:string,planId:string)=>page.waitForResponse((r:any)=>{const c=call(r.request());return c?.functionKey===name&&c.payload?.planId===planId;},{timeout:90000}).then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const b=(await r.json()).data.invokeExtension.response.body;expect(b.success).toBe(true);return b;});
  11 | const outcomes=async(frame:any)=>{await frame.getByRole('button',{name:/^Planning/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);await frame.getByRole('button',{name:'Forecast outcomes',exact:true}).click();return frame.locator('[data-testid="forecast-evaluation"]');};
  12 | const read=async(key:string)=>{const r=await get(`/rest/api/3/issue/${key}?fields=status,resolution,resolutiondate,statuscategorychangedate`);return{id:r.id,statusCategory:r.fields.status.statusCategory.key,resolutionId:r.fields.resolution?.id??null,resolutionDate:r.fields.resolutiondate??null,statusCategoryChangedDate:r.fields.statuscategorychangedate??null};};
  13 | const seed={label:'forecast observed work',duration:5,start:'2026-10-05',due:'2026-10-09'};
  14 | 
  15 | test('forecast outcomes: prospective numeric capture uses real later Jira resolution and excludes overlapping forecast samples',async({page},info)=>{
  16 |  await withOwnedSchedule(page,info,[seed],async(f)=>{
  17 |   const key=f.keys[0],jiraBefore=await f.read(key);let frame=await table(page,f.name),panel=await outcomes(frame);const journal:any={key,observations:[],predictions:[]};const persist=()=>fs.writeFileSync(info.outputPath('forecast-outcome-journal.json'),JSON.stringify(journal,null,2));
  18 |   for(const label of ['Prospective forecast one','Overlapping forecast two']){await panel.getByLabel('Forecast name').fill(label);const pending=result(page,'captureForecast',f.planId);await panel.getByRole('button',{name:'Record working forecast',exact:true}).click();const snapshot=(await pending).snapshot;journal.predictions.push(snapshot);persist();expect(snapshot.forecast.runs).toBe(300);expect(snapshot.issueCount).toBe(1);const retainedRead=result(page,'getSnapshot',f.planId);const capturedItem=panel.getByRole('heading',{name:label,exact:true}).locator('..');await capturedItem.getByRole('button',{name:'Check outcome',exact:true}).click();const retained=(await retainedRead).snapshot;expect(retained.id).toBe(snapshot.id);expect(retained.issues.map((r:any)=>r.key)).toEqual([key]);await expect(capturedItem.locator('[data-testid="forecast-outcome"]')).toContainText('still open or has been reopened');const predicted=snapshot.forecast.scopes.find((s:any)=>s.id==='plan');for(const p of ['p50','p80','p90'])expect(predicted[p]).toMatch(/^2026-10-\d{2}$/);await expect(panel.getByRole('heading',{name:label,exact:true}).locator('..')).toContainText(`Recorded P50 ${predicted.p50} · P80 ${predicted.p80} · P90 ${predicted.p90}`);}
  19 |   const first=panel.getByRole('heading',{name:'Prospective forecast one',exact:true}).locator('..');await first.getByRole('button',{name:'Check outcome',exact:true}).click();await expect(first.locator('[data-testid="forecast-outcome"]')).toContainText('still open or has been reopened');await expect(panel.locator('[data-testid="forecast-hit-rate"]')).toContainText('Insufficient observed outcomes');
  20 |   const initial=await read(key);expect(initial.statusCategory).not.toBe('done');journal.observations.push(initial);const transitions=await get(`/rest/api/3/issue/${key}/transitions?expand=transitions.fields`);const done=transitions.transitions.find((t:any)=>t.to.statusCategory.key==='done');expect(done,'real fixture workflow must expose a Done transition').toBeTruthy();journal.transition={id:done.id,name:done.name,to:done.to.name};persist();await post(`/rest/api/3/issue/${key}/transitions`,{transition:{id:done.id}});const resolved=await read(key);journal.observations.push(resolved);persist();expect(resolved.statusCategory).toBe('done');expect(resolved.resolutionId,'positive completion fixture requires a real Jira resolution, never inferred Done').toBeTruthy();expect(Date.parse(resolved.resolutionDate)).toBeGreaterThan(Math.max(...journal.predictions.map((s:any)=>Date.parse(s.takenAt))));
> 21 |   const actualDate=new Date(resolved.resolutionDate).toISOString().slice(0,10);for(const label of ['Prospective forecast one','Overlapping forecast two']){const item=panel.getByRole('heading',{name:label,exact:true}).locator('..');await item.getByRole('button',{name:'Check outcome',exact:true}).click();await expect(item.locator('[data-testid="forecast-outcome"]')).toContainText(`Observed Jira resolution completion ${actualDate} for 1 captured tasks. P80 hit.`);}
     |                                                                                                                                                                                                                                                                                                                                                                                ^ Error: expect(locator).toContainText(expected) failed
  22 |   await expect(panel.locator('[data-testid="forecast-hit-rate"]')).toHaveText('P80 observed hit rate: 1/1 (100%) against nominal 80%.');await expect(panel).toContainText('1 overlapping scopes excluded');await expect(panel).toContainText('this sample does not establish calibration');await panel.screenshot({path:info.outputPath('real-forecast-outcome-overlap.png')});expect(await f.read(key)).toEqual(jiraBefore);
  23 |   frame=await openPlan(page,f.name);panel=await outcomes(frame);await panel.getByRole('button',{name:'Load recorded forecasts',exact:true}).click();await expect(panel.getByRole('heading',{name:'Prospective forecast one',exact:true})).toBeVisible();await expect(panel.getByRole('heading',{name:'Overlapping forecast two',exact:true})).toBeVisible();await expect(panel).toContainText('0 outcomes checked in this session');await expect(panel.locator('[data-testid="forecast-outcome"]')).toHaveCount(0);journal.sessionResultsNotMisrepresentedAsRetained=true;persist();
  24 |  });
  25 | });
  26 | 
  27 | test('private observations: retained open-work evidence survives reopen, fresh Jira state is marked superseded, original raw evidence remains intact',async({page},info)=>{
  28 |  await withOwnedSchedule(page,info,[seed],async(f)=>{
  29 |   const key=f.keys[0],jiraBefore=await f.read(key);let frame=await table(page,f.name),panel=await outcomes(frame);await panel.getByLabel('Forecast name').fill('Retained evidence decision');const forecastRead=result(page,'captureForecast',f.planId);await panel.getByRole('button',{name:'Record working forecast',exact:true}).click();const forecast=(await forecastRead).snapshot;const before=await read(key);expect(before.statusCategory).not.toBe('done');const journal:any={key,forecastId:forecast.id,before};const persist=()=>fs.writeFileSync(info.outputPath('private-observation-journal.json'),JSON.stringify(journal,null,2));persist();
  30 |   let item=panel.getByRole('heading',{name:'Retained evidence decision',exact:true}).locator('..');let privatePanel=item.locator('[data-testid="retained-forecast-observations"]');const record=result(page,'finishForecastObservation',f.planId);await privatePanel.getByRole('button',{name:'Record private observation',exact:true}).click();const receipt=await record;journal.receipt=receipt;persist();expect(receipt.result.state).toBe('insufficient');expect(receipt.observation.memberCount).toBe(1);expect(receipt.observation.scopeId).toBe('plan');await expect(privatePanel.locator('[data-testid="observation-receipt"]')).toContainText('still open or has been reopened');
  31 |   frame=await openPlan(page,f.name);panel=await outcomes(frame);await panel.getByRole('button',{name:'Load recorded forecasts',exact:true}).click();item=panel.getByRole('heading',{name:'Retained evidence decision',exact:true}).locator('..');privatePanel=item.locator('[data-testid="retained-forecast-observations"]');await privatePanel.getByRole('button',{name:'Load private observations',exact:true}).click();await expect(privatePanel.locator('[data-testid="retained-observation-result"]')).toHaveCount(0);let reviewed=result(page,'finishForecastObservationReview',f.planId);await privatePanel.getByRole('button',{name:'Verify access and view retained result',exact:true}).click();const unchanged=await reviewed;journal.unchanged=unchanged;persist();expect(unchanged.state).toBe('unchanged');expect(unchanged.saved.result).toEqual(receipt.result);await expect(privatePanel).toContainText('Jira state matched at the latest check');
  32 |   const transitions=await get(`/rest/api/3/issue/${key}/transitions?expand=transitions.fields`);const change=transitions.transitions.find((t:any)=>t.to.statusCategory.key==='indeterminate'&&t.to.statusCategory.key!==before.statusCategory);expect(change,'same owned Jira issue exposes a category-changing in-progress transition').toBeTruthy();journal.transition={id:change.id,name:change.name};persist();await post(`/rest/api/3/issue/${key}/transitions`,{transition:{id:change.id}});const after=await read(key);journal.after=after;persist();expect(after.statusCategory).toBe('indeterminate');
  33 |   reviewed=result(page,'finishForecastObservationReview',f.planId);await privatePanel.getByRole('button',{name:'Verify access and view retained result',exact:true}).click();const superseded=await reviewed;journal.superseded=superseded;persist();expect(superseded.state).toBe('superseded');expect(superseded.saved.result).toEqual(receipt.result);expect(superseded.checked.result.state).toBe('insufficient');await expect(privatePanel).toContainText('Jira state changed since that observation');await expect(privatePanel).toContainText('must not be treated as the current completion state');
  34 |   const evidenceRead=result(page,'getForecastObservationEvidence',f.planId);await privatePanel.getByRole('button',{name:'Show checked evidence',exact:true}).click();const evidence=await evidenceRead;journal.evidence=evidence;persist();expect(evidence.state).toBe('read');expect(evidence.rows).toHaveLength(1);expect(evidence.rows[0].saved).toMatchObject({...before,readable:true});expect(evidence.rows[0].checked).toMatchObject({...after,readable:true});await expect(privatePanel.locator('tbody tr')).toHaveCount(1);await expect(privatePanel.locator('tbody tr td').nth(0)).toHaveText(before.id);await expect(privatePanel.locator('tbody tr td').nth(1)).toContainText(before.statusCategory);await expect(privatePanel.locator('tbody tr td').nth(2)).toContainText(after.statusCategory);await privatePanel.screenshot({path:info.outputPath('retained-observation-superseded-evidence.png')});expect(await f.read(key)).toEqual(jiraBefore);
  35 |  });
  36 | });
  37 | 
```