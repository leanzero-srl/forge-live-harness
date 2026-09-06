import {withReportDeparture,setReportDepartureOwner,stopReportUi,reportDepartureFailure} from './report-departure';
import {captureReport,cleanupOwnedReportCaptures} from './report-capture';
import {settledScreenshot,waitForAppReady} from './settled-screenshot.mjs';
import {fixtureReportRows} from './report-fixture-oracle.mjs';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {test,expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {openPlan,scheduleFields,LZPT_PLAN} from './forecast-fixture';
import {editDuration,save} from './normalization-owned-fixture';
test.describe.configure({retries:0,timeout:900000});
const call=(req:any)=>{try{let raw=req.postDataBuffer();if(raw?.[0]===31&&raw?.[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString()).variables?.input?.payload?.call;}catch{return null;}};
const result=(page:any,name:string,planId:string)=>page.waitForResponse((r:any)=>{const c=call(r.request());return c?.functionKey===name&&c.payload?.planId===planId;},{timeout:90000}).then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const b=(await r.json()).data.invokeExtension.response.body;expect(b.success).toBe(true);return b;});
const planning=async(frame:any)=>{await frame.getByRole('button',{name:/^Planning/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);return frame.locator('[data-testid="planning-workspace"]');};

test('reports: complete actual paged HTML and printed PDF retain all source rows and independent deleted-baseline copy',async({page},info)=>{
 await withReportDeparture(page,info,async()=>{
 const source=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});const keys=source.issues.map((i:any)=>i.key).sort();expect(keys,'standing source is the exact original45 after foreign cleanup').toEqual(Array.from({length:45},(_,n)=>`LZPT-${186+n}`).sort());
 const registry=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();const name=`[harness-test] Report proof ${Date.now().toString(36)}`;let planId:string|undefined,bodyFailure:any,reportRecovery:any;
 const journal:any={name,sourceKeys:keys,sourceCount:keys.length};fs.mkdirSync(info.outputDir,{recursive:true});const persist=()=>fs.writeFileSync(info.outputPath('report-journal.json'),JSON.stringify(journal,null,2));persist();
 try{
  const created=await getTestState('lz-ppm',{what:'createFixture',name,jql:`key in (${keys.join(',')}) ORDER BY key`});planId=created.planId;if(typeof planId!=='string'||!planId)throw new Error('Report fixture creation returned no plan ID');journal.planId=planId;persist();setReportDepartureOwner(page,planId,name);expect(created.issues.map((i:any)=>i.key).sort()).toEqual(keys);
  let frame=await openPlan(page,name),work=await planning(frame);
  const capture=async(label:string)=>{await work.getByLabel('Capture name').fill(label);await work.locator('form').getByRole('combobox').first().click();await frame.getByRole('option',{name:'Baseline',exact:true}).click();const response=result(page,'getSnapshot',planId!);await work.getByRole('button',{name:'Capture working plan',exact:true}).click();await expect(work.locator('[data-testid="snapshot-detail"] h3').first()).toHaveText(label);const snapshot=(await response).snapshot;await work.getByRole('button',{name:'Use as baseline',exact:true}).click();await expect(work).toContainText(`Baseline set to ${label}`);return snapshot;};
  const original=await capture('Report original baseline');expect(original.issues).toHaveLength(keys.length);expect(original.mode).not.toBe('simulation');expect(original.workingChangeCount).toBe(0);expect(scheduleFields(original.issues)).toEqual(scheduleFields(created.issues));journal.originalBaseline={id:original.id,hash:original.hash};persist();
  const assertTable=async(expected:any[])=>{
   const rows=frame.locator('[data-testid="table-row"]');await expect(rows).toHaveCount(keys.length);await waitForAppReady(rows.first());
   const actual=await rows.evaluateAll((nodes:any[])=>nodes.map(r=>({key:r.dataset.rowKey,startDate:r.dataset.rowStart||null,dueDate:r.dataset.rowDue||null,duration:r.dataset.rowDuration===''?null:Number(r.dataset.rowDuration)})).sort((a:any,b:any)=>a.key.localeCompare(b.key)));
   expect(actual).toEqual(expected.map(({summary,...schedule}:any)=>schedule));return actual;
  };
  await frame.getByRole('button',{name:/^Table/i}).first().click();
  journal.initialWorkingRows=await assertTable(fixtureReportRows(created.issues,original.calendar));persist();
  await editDuration(frame,'LZPT-209','7');await save(frame);const savedRaw=(await getTestState('lz-ppm',{what:'plan',planId})).issues;
  // Raw KVS keeps untouched Jira-null durations. The ordinary report hydrates
  // those dates; saved explicit current values remain their own layer.
  const capturedSchedule=fixtureReportRows(savedRaw,original.calendar);expect(capturedSchedule.find((r:any)=>r.key==='LZPT-209')).toMatchObject({startDate:'2026-10-05',dueDate:'2026-10-13',duration:7});
  journal.savedRawSchedule=scheduleFields(savedRaw);journal.capturedWorkingRows=await assertTable(capturedSchedule);persist();
  work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();let report=work.locator('[data-testid="sponsor-reports"]');await report.getByLabel('Report name').fill('All rows and retained baseline');const manifest=await captureReport(page,report,planId!,info,{onRecovery:(error:any)=>{reportRecovery=error;journal.reportRecovery=error.reportState;persist();}});journal.report=manifest;persist();expect(manifest.counts.timeline).toBe(keys.length);expect(manifest.pages.timeline).toBe(Math.ceil(keys.length/50));expect(manifest.baseline).toMatchObject({name:'Report original baseline',issueCount:keys.length});
  await expect(report).toContainText(`Baseline: Report original baseline · ${keys.length} retained rows.`);const preview=report.getByRole('table',{name:'Report preview'});const seen:string[]=[];
  for(let number=0;number<manifest.pages.timeline;number++){await expect(report).toContainText(`Page ${number+1} of ${manifest.pages.timeline}`);const pageKeys=await preview.locator('tbody th').allTextContents();expect(pageKeys.length).toBeGreaterThan(0);seen.push(...pageKeys);if(number+1<manifest.pages.timeline)await report.getByRole('button',{name:'Next report page',exact:true}).click();}
  expect(seen.sort()).toEqual(keys);await settledScreenshot(report,{path:info.outputPath('report-final-preview-page.png')});
  const download=async(suffix:string)=>{const pending=page.waitForEvent('download');await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();const downloaded=await pending;expect(downloaded.suggestedFilename()).toBe(`sponsor-report-${manifest.id}.html`);const file=info.outputPath(`actual-report-${suffix}.html`);await downloaded.saveAs(file);return file;};
  const first=await download('before-baseline-delete');const reportPage=await page.context().newPage();let externalRequests:string[]=[],documentFailure:any;reportPage.on('request',(r:any)=>{if(/^https?:/.test(r.url()))externalRequests.push(r.url());});
  try{await reportPage.goto(pathToFileURL(first).href);await expect(reportPage.locator('tr[data-issue-key]')).toHaveCount(keys.length);expect((await reportPage.locator('tr[data-issue-key]').evaluateAll((rows:any[])=>rows.map(r=>r.getAttribute('data-issue-key')))).sort()).toEqual(keys);await expect(reportPage.locator('script,iframe,img,link')).toHaveCount(0);expect(externalRequests).toEqual([]);
   for(const row of capturedSchedule){const actual=reportPage.locator(`tr[data-issue-key="${row.key}"] td`);await expect(actual.nth(1)).toHaveText(row.summary);await expect(actual.nth(2)).toHaveText(row.startDate??'—');await expect(actual.nth(3)).toHaveText(row.dueDate??'—');await expect(actual.nth(4)).toHaveText(String(row.duration??'—'));}
   const changes=reportPage.locator('section.report-section').filter({has:reportPage.getByRole('heading',{name:'Baseline changes',exact:true})});const changed=changes.locator('tbody tr').filter({hasText:'LZPT-209'});await expect(changed).toContainText('2026-10-05 → 2026-10-12; duration 6');await expect(changed).toContainText('2026-10-05 → 2026-10-13; duration 7');await settledScreenshot(reportPage,{subject:changed,path:info.outputPath('actual-report-complete.png'),fullPage:true});await reportPage.pdf({path:info.outputPath('actual-report.pdf'),format:'A4',landscape:true,printBackground:true,preferCSSPageSize:true});
  }catch(error){documentFailure=error;journal.documentFailure=String(error);persist();throw error;
  }finally{try{await reportPage.close();}catch(error){journal.documentCloseFailure=String(error);persist();throw new AggregateError([...(documentFailure?[documentFailure]:[]),error],'Report artifact inspection and/or owned page close failed');}}
  await work.getByRole('button',{name:'Scenarios & history',exact:true}).click();await capture('Replacement baseline');await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Report original baseline'}).click();await work.getByRole('button',{name:'Delete capture',exact:true}).click();await frame.getByRole('button',{name:'Delete capture',exact:true}).last().click();await expect(work).toContainText('Capture deleted.');
  frame=await openPlan(page,name);work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();report=work.locator('[data-testid="sponsor-reports"]');await report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button').filter({hasText:'All rows and retained baseline'}).click();await expect(report).toContainText(`Baseline: Report original baseline · ${keys.length} retained rows.`);const second=await download('after-baseline-delete');expect(fs.readFileSync(second,'utf8')).toBe(fs.readFileSync(first,'utf8'));journal.independentBaselineCopyVerified=true;persist();
  await report.getByRole('button',{name:'Delete report',exact:true}).click();await frame.getByRole('button',{name:'Delete report',exact:true}).last().click();await expect(report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button')).toHaveCount(0);
 }catch(error){bodyFailure=error;journal.bodyFailure=String(error);persist();throw error;
 }finally{
  const failures:any[]=[];journal.cleanup=[];
  const clean=async(label:string,action:()=>Promise<void>)=>{try{await action();journal.cleanup.push({label,ok:true});}catch(error){failures.push(error);journal.cleanup.push({label,ok:false,error:String(error)});}persist();};
  await clean('stop owned UI',async()=>stopReportUi(page,async()=>{if(!page.isClosed())await page.goto('about:blank').catch(()=>page.close());}));
  const departureFailure=reportDepartureFailure(page);if(departureFailure){reportRecovery=departureFailure;journal.reportRecovery=departureFailure.reportState;persist();}
  await clean('identify owned plan',async()=>{if(!planId)planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;});
  if(planId)await clean('report job cleanup',async()=>{await cleanupOwnedReportCaptures(page,planId!,info,{onRecovery:(e:any)=>{reportRecovery=e;journal.reportRecovery=e.reportState;persist();}});});
  if(planId&&!reportRecovery){const ownedPlanId=planId;await clean('clear owned drafts',async()=>{await getTestState('lz-ppm',{what:'clearDrafts',planId:ownedPlanId});});await clean('delete owned plan',async()=>{expect(await getTestState('lz-ppm',{what:'deleteFixture',planId:ownedPlanId})).toEqual({deleted:ownedPlanId,registryRemoved:true});});}
  await clean('registry restored',async()=>{expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(reportRecovery?[...registry,planId].sort():registry);});
  await clean('source unchanged',async()=>{expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(source.issues));});
  if(reportRecovery){journal.retainedForRecovery={planId,reason:reportRecovery.message};failures.push(reportRecovery);}journal.cleanupVerified=failures.length===0;persist();
  if(failures.length)throw new AggregateError([...(bodyFailure?[bodyFailure]:[]),...failures],'Report test and/or cleanup failed; original evidence retained');
 }
 });
});
