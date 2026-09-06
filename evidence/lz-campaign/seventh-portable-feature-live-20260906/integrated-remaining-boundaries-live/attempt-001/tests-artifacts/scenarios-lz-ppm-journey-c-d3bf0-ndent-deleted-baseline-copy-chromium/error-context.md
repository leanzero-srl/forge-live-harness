# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report.spec.ts >> reports: complete actual paged HTML and printed PDF retain all source rows and independent deleted-baseline copy
- Location: scenarios/lz-ppm/journey-campaign-report.spec.ts:15:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="planning-workspace"]').locator('[data-testid="snapshot-detail"] h3').first()
Expected: "Replacement baseline"
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" with timeout 15000ms
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="planning-workspace"]').locator('[data-testid="snapshot-detail"] h3').first()

```

```yaml
- banner:
  - button "LeanZero Management home": LeanZero Management
  - navigation:
    - button "Plans"
    - button "Capacity"
  - text: Portfolio control · rev
  - strong: v4.58.579
- main:
  - button "Back to plans": ←
  - text: "[harness-test] Report proof mtp2ws8e Ready 45 issues · 37 tasks ?"
  - img
  - text: Standard (Mon-Fri)
  - button "JQL":
    - img
    - text: JQL
  - button "45 partial":
    - img
    - text: 45 partial
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
  - img
  - text: 20s ago
  - button "Saved" [disabled]
  - button "Delete"
  - button "Re-index"
  - text: "?"
  - button "Apply 2 changes"
  - navigation "Planning views":
    - button "Scenarios & history"
    - button "Targets"
    - button "Forecast outcomes"
    - button "Sponsor reports"
  - paragraph: Plan decisions
  - heading "Scenarios & history" [level=2]
  - paragraph: Capture an alternative, compare it with your working schedule, and keep a dated record of your decisions.
  - button "Refresh history"
  - text: Capture name
  - textbox "Capture name":
    - /placeholder: e.g. September commitment
    - text: Replacement baseline
  - text: Record type
  - combobox "Record type":
    - text: Baseline
    - img
  - text: Duration uncertainty
  - combobox "Duration uncertainty":
    - text: Medium
    - img
  - button "Capture working plan"
  - text: Includes the complete indexed scope, working schedule edits, calendar, targets and selected uncertainty. Captures with the same name remain separate dated records.
  - navigation "Retained captures":
    - button "baseline Report original baseline 9/6/2026, 3:34:09 AM 45 issues · revision 2":
      - text: baseline
      - strong: Report original baseline
      - text: 9/6/2026, 3:34:09 AM 45 issues · revision 2
  - paragraph: Select a capture to inspect its schedule and compare changes.
```

# Test source

```ts
  1  | import {settledScreenshot,waitForAppReady} from './settled-screenshot.mjs';
  2  | import {fixtureReportRows} from './report-fixture-oracle.mjs';
  3  | import fs from 'node:fs';
  4  | import {pathToFileURL} from 'node:url';
  5  | import {gunzipSync} from 'node:zlib';
  6  | import {test,expect} from '../../fixtures/forge';
  7  | import {getTestState} from '../../testhook/client';
  8  | import {openPlan,scheduleFields,LZPT_PLAN} from './forecast-fixture';
  9  | import {editDuration,save} from './normalization-owned-fixture';
  10 | test.describe.configure({retries:0,timeout:900000});
  11 | const call=(req:any)=>{try{let raw=req.postDataBuffer();if(raw?.[0]===31&&raw?.[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString()).variables?.input?.payload?.call;}catch{return null;}};
  12 | const result=(page:any,name:string,planId:string)=>page.waitForResponse((r:any)=>{const c=call(r.request());return c?.functionKey===name&&c.payload?.planId===planId;},{timeout:90000}).then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const b=(await r.json()).data.invokeExtension.response.body;expect(b.success).toBe(true);return b;});
  13 | const planning=async(frame:any)=>{await frame.getByRole('button',{name:/^Planning/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);return frame.locator('[data-testid="planning-workspace"]');};
  14 | 
  15 | test('reports: complete actual paged HTML and printed PDF retain all source rows and independent deleted-baseline copy',async({page},info)=>{
  16 |  const source=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});const keys=source.issues.map((i:any)=>i.key).sort();expect(keys,'standing source is the exact original45 after foreign cleanup').toEqual(Array.from({length:45},(_,n)=>`LZPT-${186+n}`).sort());
  17 |  const registry=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();const name=`[harness-test] Report proof ${Date.now().toString(36)}`;let planId:string|undefined,bodyFailure:any;
  18 |  const journal:any={name,sourceKeys:keys,sourceCount:keys.length};fs.mkdirSync(info.outputDir,{recursive:true});const persist=()=>fs.writeFileSync(info.outputPath('report-journal.json'),JSON.stringify(journal,null,2));persist();
  19 |  try{
  20 |   const created=await getTestState('lz-ppm',{what:'createFixture',name,jql:`key in (${keys.join(',')}) ORDER BY key`});planId=created.planId;if(typeof planId!=='string'||!planId)throw new Error('Report fixture creation returned no plan ID');journal.planId=planId;persist();expect(created.issues.map((i:any)=>i.key).sort()).toEqual(keys);
  21 |   let frame=await openPlan(page,name),work=await planning(frame);
> 22 |   const capture=async(label:string)=>{await work.getByLabel('Capture name').fill(label);await work.locator('form').getByRole('combobox').first().click();await frame.getByRole('option',{name:'Baseline',exact:true}).click();const response=result(page,'getSnapshot',planId!);await work.getByRole('button',{name:'Capture working plan',exact:true}).click();await expect(work.locator('[data-testid="snapshot-detail"] h3').first()).toHaveText(label);const snapshot=(await response).snapshot;await work.getByRole('button',{name:'Use as baseline',exact:true}).click();await expect(work).toContainText(`Baseline set to ${label}`);return snapshot;};
     |                                                                                                                                                                                                                                                                                                                                                                                                                                          ^ Error: expect(locator).toHaveText(expected) failed
  23 |   const original=await capture('Report original baseline');expect(original.issues).toHaveLength(keys.length);expect(original.mode).not.toBe('simulation');expect(original.workingChangeCount).toBe(0);expect(scheduleFields(original.issues)).toEqual(scheduleFields(created.issues));journal.originalBaseline={id:original.id,hash:original.hash};persist();
  24 |   const assertTable=async(expected:any[])=>{
  25 |    const rows=frame.locator('[data-testid="table-row"]');await expect(rows).toHaveCount(keys.length);await waitForAppReady(rows.first());
  26 |    const actual=await rows.evaluateAll((nodes:any[])=>nodes.map(r=>({key:r.dataset.rowKey,startDate:r.dataset.rowStart||null,dueDate:r.dataset.rowDue||null,duration:r.dataset.rowDuration===''?null:Number(r.dataset.rowDuration)})).sort((a:any,b:any)=>a.key.localeCompare(b.key)));
  27 |    expect(actual).toEqual(expected.map(({summary,...schedule}:any)=>schedule));return actual;
  28 |   };
  29 |   await frame.getByRole('button',{name:/^Table/i}).first().click();
  30 |   journal.initialWorkingRows=await assertTable(fixtureReportRows(created.issues,original.calendar));persist();
  31 |   await editDuration(frame,'LZPT-209','7');await save(frame);const savedRaw=(await getTestState('lz-ppm',{what:'plan',planId})).issues;
  32 |   // Raw KVS keeps untouched Jira-null durations. The ordinary report hydrates
  33 |   // those dates; saved explicit current values remain their own layer.
  34 |   const capturedSchedule=fixtureReportRows(savedRaw,original.calendar);expect(capturedSchedule.find((r:any)=>r.key==='LZPT-209')).toMatchObject({startDate:'2026-10-05',dueDate:'2026-10-13',duration:7});
  35 |   journal.savedRawSchedule=scheduleFields(savedRaw);journal.capturedWorkingRows=await assertTable(capturedSchedule);persist();
  36 |   work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();let report=work.locator('[data-testid="sponsor-reports"]');await report.getByLabel('Report name').fill('All rows and retained baseline');const captured=result(page,'captureSponsorReport',planId!);await report.getByRole('button',{name:'Capture sponsor report',exact:true}).click();const manifest=(await captured).report;journal.report=manifest;persist();expect(manifest.counts.timeline).toBe(keys.length);expect(manifest.pages.timeline).toBe(Math.ceil(keys.length/50));expect(manifest.baseline).toMatchObject({name:'Report original baseline',issueCount:keys.length});
  37 |   await expect(report).toContainText(`Baseline: Report original baseline · ${keys.length} retained rows.`);const preview=report.getByRole('table',{name:'Report preview'});const seen:string[]=[];
  38 |   for(let number=0;number<manifest.pages.timeline;number++){await expect(report).toContainText(`Page ${number+1} of ${manifest.pages.timeline}`);const pageKeys=await preview.locator('tbody th').allTextContents();expect(pageKeys.length).toBeGreaterThan(0);seen.push(...pageKeys);if(number+1<manifest.pages.timeline)await report.getByRole('button',{name:'Next report page',exact:true}).click();}
  39 |   expect(seen.sort()).toEqual(keys);await settledScreenshot(report,{path:info.outputPath('report-final-preview-page.png')});
  40 |   const download=async(suffix:string)=>{const pending=page.waitForEvent('download');await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();const downloaded=await pending;expect(downloaded.suggestedFilename()).toBe(`sponsor-report-${manifest.id}.html`);const file=info.outputPath(`actual-report-${suffix}.html`);await downloaded.saveAs(file);return file;};
  41 |   const first=await download('before-baseline-delete');const reportPage=await page.context().newPage();let externalRequests:string[]=[],documentFailure:any;reportPage.on('request',(r:any)=>{if(/^https?:/.test(r.url()))externalRequests.push(r.url());});
  42 |   try{await reportPage.goto(pathToFileURL(first).href);await expect(reportPage.locator('tr[data-issue-key]')).toHaveCount(keys.length);expect((await reportPage.locator('tr[data-issue-key]').evaluateAll((rows:any[])=>rows.map(r=>r.getAttribute('data-issue-key')))).sort()).toEqual(keys);await expect(reportPage.locator('script,iframe,img,link')).toHaveCount(0);expect(externalRequests).toEqual([]);
  43 |    for(const row of capturedSchedule){const actual=reportPage.locator(`tr[data-issue-key="${row.key}"] td`);await expect(actual.nth(1)).toHaveText(row.summary);await expect(actual.nth(2)).toHaveText(row.startDate??'—');await expect(actual.nth(3)).toHaveText(row.dueDate??'—');await expect(actual.nth(4)).toHaveText(String(row.duration??'—'));}
  44 |    const changes=reportPage.locator('section.report-section').filter({has:reportPage.getByRole('heading',{name:'Baseline changes',exact:true})});const changed=changes.locator('tbody tr').filter({hasText:'LZPT-209'});await expect(changed).toContainText('2026-10-05 → 2026-10-12; duration 6');await expect(changed).toContainText('2026-10-05 → 2026-10-13; duration 7');await settledScreenshot(reportPage,{subject:changed,path:info.outputPath('actual-report-complete.png'),fullPage:true});await reportPage.pdf({path:info.outputPath('actual-report.pdf'),format:'A4',landscape:true,printBackground:true,preferCSSPageSize:true});
  45 |   }catch(error){documentFailure=error;journal.documentFailure=String(error);persist();throw error;
  46 |   }finally{try{await reportPage.close();}catch(error){journal.documentCloseFailure=String(error);persist();throw new AggregateError([...(documentFailure?[documentFailure]:[]),error],'Report artifact inspection and/or owned page close failed');}}
  47 |   await work.getByRole('button',{name:'Scenarios & history',exact:true}).click();await capture('Replacement baseline');await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Report original baseline'}).click();await work.getByRole('button',{name:'Delete capture',exact:true}).click();await frame.getByRole('button',{name:'Delete capture',exact:true}).last().click();await expect(work).toContainText('Capture deleted.');
  48 |   frame=await openPlan(page,name);work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();report=work.locator('[data-testid="sponsor-reports"]');await report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button').filter({hasText:'All rows and retained baseline'}).click();await expect(report).toContainText(`Baseline: Report original baseline · ${keys.length} retained rows.`);const second=await download('after-baseline-delete');expect(fs.readFileSync(second,'utf8')).toBe(fs.readFileSync(first,'utf8'));journal.independentBaselineCopyVerified=true;persist();
  49 |   await report.getByRole('button',{name:'Delete report',exact:true}).click();await frame.getByRole('button',{name:'Delete report',exact:true}).last().click();await expect(report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button')).toHaveCount(0);
  50 |  }catch(error){bodyFailure=error;journal.bodyFailure=String(error);persist();throw error;
  51 |  }finally{
  52 |   const failures:any[]=[];journal.cleanup=[];
  53 |   const clean=async(label:string,action:()=>Promise<void>)=>{try{await action();journal.cleanup.push({label,ok:true});}catch(error){failures.push(error);journal.cleanup.push({label,ok:false,error:String(error)});}persist();};
  54 |   await clean('stop owned UI',async()=>{if(!page.isClosed())await page.goto('about:blank').catch(()=>page.close());});
  55 |   await clean('identify owned plan',async()=>{if(!planId)planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;});
  56 |   if(planId){const ownedPlanId=planId;await clean('clear owned drafts',async()=>{await getTestState('lz-ppm',{what:'clearDrafts',planId:ownedPlanId});});await clean('delete owned plan',async()=>{expect(await getTestState('lz-ppm',{what:'deleteFixture',planId:ownedPlanId})).toEqual({deleted:ownedPlanId,registryRemoved:true});});}
  57 |   await clean('registry restored',async()=>{expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(registry);});
  58 |   await clean('source unchanged',async()=>{expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(source.issues));});
  59 |   journal.cleanupVerified=failures.length===0;persist();
  60 |   if(failures.length)throw new AggregateError([...(bodyFailure?[bodyFailure]:[]),...failures],'Report test and/or cleanup failed; original evidence retained');
  61 |  }
  62 | });
  63 | 
```