# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report.spec.ts >> reports: complete actual paged HTML and printed PDF retain all source rows and independent deleted-baseline copy
- Location: scenarios/lz-ppm/journey-campaign-report.spec.ts:13:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 6
+ Received  + 0

@@ -42,12 +42,6 @@
    "LZPT-226",
    "LZPT-227",
    "LZPT-228",
    "LZPT-229",
    "LZPT-230",
-   "LZPT-284",
-   "LZPT-285",
-   "LZPT-286",
-   "LZPT-287",
-   "LZPT-288",
-   "LZPT-289",
  ]
```

# Test source

```ts
  1  | import fs from 'node:fs';
  2  | import {pathToFileURL} from 'node:url';
  3  | import {gunzipSync} from 'node:zlib';
  4  | import {test,expect} from '../../fixtures/forge';
  5  | import {getTestState} from '../../testhook/client';
  6  | import {openPlan,scheduleFields,LZPT_PLAN} from './forecast-fixture';
  7  | import {editDuration,save} from './normalization-owned-fixture';
  8  | test.describe.configure({retries:0,timeout:900000});
  9  | const call=(req:any)=>{try{let raw=req.postDataBuffer();if(raw?.[0]===31&&raw?.[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString()).variables?.input?.payload?.call;}catch{return null;}};
  10 | const result=(page:any,name:string,planId:string)=>page.waitForResponse((r:any)=>{const c=call(r.request());return c?.functionKey===name&&c.payload?.planId===planId;},{timeout:90000}).then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const b=(await r.json()).data.invokeExtension.response.body;expect(b.success).toBe(true);return b;});
  11 | const planning=async(frame:any)=>{await frame.getByRole('button',{name:/^Planning/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);return frame.locator('[data-testid="planning-workspace"]');};
  12 | 
  13 | test('reports: complete actual paged HTML and printed PDF retain all source rows and independent deleted-baseline copy',async({page},info)=>{
  14 |  const source=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});const keys=source.issues.map((i:any)=>i.key).sort();expect(keys.length,'fixture must cross the real fifty-row backend page boundary').toBeGreaterThan(50);
  15 |  const registry=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();const name=`[harness-test] Report proof ${Date.now().toString(36)}`;let planId:string|undefined;
  16 |  const journal:any={name,sourceKeys:keys,sourceCount:keys.length};fs.mkdirSync(info.outputDir,{recursive:true});const persist=()=>fs.writeFileSync(info.outputPath('report-journal.json'),JSON.stringify(journal,null,2));persist();
  17 |  try{
> 18 |   const created=await getTestState('lz-ppm',{what:'createFixture',name,jql:`key in (${keys.join(',')}) ORDER BY key`});planId=created.planId;if(typeof planId!=='string'||!planId)throw new Error('Report fixture creation returned no plan ID');journal.planId=planId;persist();expect(created.issues.map((i:any)=>i.key).sort()).toEqual(keys);
     |                                                                                                                                                                                                                                                                                                                                    ^ Error: expect(received).toEqual(expected) // deep equality
  19 |   let frame=await openPlan(page,name),work=await planning(frame);
  20 |   const capture=async(label:string)=>{await work.getByLabel('Capture name').fill(label);await work.locator('form').getByRole('combobox').first().click();await frame.getByRole('option',{name:'Baseline',exact:true}).click();const response=result(page,'getSnapshot',planId!);await work.getByRole('button',{name:'Capture working plan',exact:true}).click();await expect(work.locator('[data-testid="snapshot-detail"] h3').first()).toHaveText(label);const snapshot=(await response).snapshot;await work.getByRole('button',{name:'Use as baseline',exact:true}).click();await expect(work).toContainText(`Baseline set to ${label}`);return snapshot;};
  21 |   const original=await capture('Report original baseline');expect(original.issues).toHaveLength(keys.length);journal.originalBaseline={id:original.id,hash:original.hash};persist();
  22 |   await frame.getByRole('button',{name:/^Table/i}).first().click();await editDuration(frame,'LZPT-209','7');await save(frame);const capturedSchedule=scheduleFields((await getTestState('lz-ppm',{what:'plan',planId})).issues);expect(capturedSchedule.find((r:any)=>r.key==='LZPT-209')).toMatchObject({startDate:'2026-10-05',dueDate:'2026-10-13',duration:7});
  23 |   work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();let report=work.locator('[data-testid="sponsor-reports"]');await report.getByLabel('Report name').fill('All rows and retained baseline');const captured=result(page,'captureSponsorReport',planId!);await report.getByRole('button',{name:'Capture sponsor report',exact:true}).click();const manifest=(await captured).report;journal.report=manifest;persist();expect(manifest.counts.timeline).toBe(keys.length);expect(manifest.pages.timeline).toBeGreaterThan(1);expect(manifest.baseline).toMatchObject({name:'Report original baseline',issueCount:keys.length});
  24 |   await expect(report).toContainText(`Baseline: Report original baseline · ${keys.length} retained rows.`);const preview=report.getByRole('table',{name:'Report preview'});const seen:string[]=[];
  25 |   for(let number=0;number<manifest.pages.timeline;number++){await expect(report).toContainText(`Page ${number+1} of ${manifest.pages.timeline}`);const pageKeys=await preview.locator('tbody th').allTextContents();expect(pageKeys.length).toBeGreaterThan(0);seen.push(...pageKeys);if(number+1<manifest.pages.timeline)await report.getByRole('button',{name:'Next report page',exact:true}).click();}
  26 |   expect(seen.sort()).toEqual(keys);await report.screenshot({path:info.outputPath('report-final-preview-page.png')});
  27 |   const download=async(suffix:string)=>{const pending=page.waitForEvent('download');await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();const downloaded=await pending;expect(downloaded.suggestedFilename()).toBe(`sponsor-report-${manifest.id}.html`);const file=info.outputPath(`actual-report-${suffix}.html`);await downloaded.saveAs(file);return file;};
  28 |   const first=await download('before-baseline-delete');const reportPage=await page.context().newPage();let externalRequests:string[]=[];reportPage.on('request',(r:any)=>{if(/^https?:/.test(r.url()))externalRequests.push(r.url());});
  29 |   try{await reportPage.goto(pathToFileURL(first).href);await expect(reportPage.locator('tr[data-issue-key]')).toHaveCount(keys.length);expect((await reportPage.locator('tr[data-issue-key]').evaluateAll((rows:any[])=>rows.map(r=>r.getAttribute('data-issue-key')))).sort()).toEqual(keys);await expect(reportPage.locator('script,iframe,img,link')).toHaveCount(0);expect(externalRequests).toEqual([]);
  30 |    for(const row of capturedSchedule){const actual=reportPage.locator(`tr[data-issue-key="${row.key}"] td`);await expect(actual.nth(2)).toHaveText(row.startDate??'—');await expect(actual.nth(3)).toHaveText(row.dueDate??'—');await expect(actual.nth(4)).toHaveText(String(row.duration??'—'));}
  31 |    const changes=reportPage.locator('section.report-section').filter({has:reportPage.getByRole('heading',{name:'Baseline changes',exact:true})});const changed=changes.locator('tbody tr').filter({hasText:'LZPT-209'});await expect(changed).toContainText('2026-10-05 → 2026-10-12; duration 6');await expect(changed).toContainText('2026-10-05 → 2026-10-13; duration 7');await reportPage.screenshot({path:info.outputPath('actual-report-complete.png'),fullPage:true});await reportPage.pdf({path:info.outputPath('actual-report.pdf'),format:'A4',landscape:true,printBackground:true,preferCSSPageSize:true});
  32 |   }finally{await reportPage.close();}
  33 |   await work.getByRole('button',{name:'Scenarios & history',exact:true}).click();await capture('Replacement baseline');await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Report original baseline'}).click();await work.getByRole('button',{name:'Delete capture',exact:true}).click();await frame.getByRole('button',{name:'Delete capture',exact:true}).last().click();await expect(work).toContainText('Capture deleted.');
  34 |   frame=await openPlan(page,name);work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();report=work.locator('[data-testid="sponsor-reports"]');await report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button').filter({hasText:'All rows and retained baseline'}).click();await expect(report).toContainText(`Baseline: Report original baseline · ${keys.length} retained rows.`);const second=await download('after-baseline-delete');expect(fs.readFileSync(second,'utf8')).toBe(fs.readFileSync(first,'utf8'));journal.independentBaselineCopyVerified=true;persist();
  35 |   await report.getByRole('button',{name:'Delete report',exact:true}).click();await frame.getByRole('button',{name:'Delete report',exact:true}).last().click();await expect(report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button')).toHaveCount(0);
  36 |  }finally{
  37 |   if(!page.isClosed())await page.goto('about:blank').catch(()=>page.close());if(!planId)planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;if(planId){await getTestState('lz-ppm',{what:'clearDrafts',planId});await getTestState('lz-ppm',{what:'deleteFixture',planId});}
  38 |   expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(registry);expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(source.issues));journal.cleanupVerified=true;persist();
  39 |  }
  40 | });
  41 | 
```