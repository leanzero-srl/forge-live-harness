import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {test,expect} from '../../fixtures/forge';
import {getHarnessLaunchReceipt} from '../../forge/browser';
import {assertDiagnosticReceipt,readDiagnosticRuntime} from './portable-diagnostic-receipt.mjs';
import {getTestState} from '../../testhook/client';
import {openPlan} from './forecast-fixture';
import {actualResponse,currentUserResolver,planning} from './campaign-ui';
import {settledScreenshot} from './settled-screenshot.mjs';
test.describe.configure({retries:0,timeout:180000});
test('diagnostic: portable current Chrome downloads the exact retained sixth sponsor report without creating or changing captured data',async({page},info)=>{
 expect(process.env.LZ_HARNESS_BROWSER_MODE).toBe('portable-chrome152');const receipt=assertDiagnosticReceipt(getHarnessLaunchReceipt(page.context()));expect(process.env.LZ_SIXTH_NUMERIC_JOURNAL).toBeTruthy();
 const sourcePath=path.resolve(process.env.LZ_SIXTH_NUMERIC_JOURNAL!);expect(createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')).toBe('66349d6e67c949c9c1919f174efc035a1b462c57874ddd3677e60a2f49eeadca');const source=JSON.parse(fs.readFileSync(sourcePath,'utf8')),fixture=JSON.parse(fs.readFileSync(path.join(path.dirname(sourcePath),'fixture-journal.json'),'utf8'));
 expect(fixture.planId).toBe('plan-test-mtozislw-v816ze');expect(source.summary.id).toBe('4fbb1943-7064-4dc1-8faa-e06816c188f6');
 const journal:any={sourcePath,diagnosticOnly:true,mode:'portable-chrome152',receipt,lifecycle:[]};const retain=()=>fs.writeFileSync(info.outputPath('portable-retained-download.json'),JSON.stringify(journal,null,2)),stage=(name:string,details:any={})=>{journal.lifecycle.push({name,time:new Date().toISOString(),...details});retain();};retain();
 const rpc=currentUserResolver(page,c=>c?.functionKey==='getSponsorReport');
 page.on('crash',()=>stage('app-page-crash'));page.on('close',()=>stage('app-page-closed'));page.context().on('close',()=>stage('browser-context-closed'));
 try{
  journal.browser=await readDiagnosticRuntime(page.context());journal.requestedHeadless=process.env.HEADLESS==='1';retain();
  const originalPlan=await getTestState('lz-ppm',{what:'plan',planId:fixture.planId});expect(originalPlan.meta.name).toBe(fixture.name);expect(originalPlan.issues.map((i:any)=>i.key)).toEqual(['WFH-2847']);
  const frame=await openPlan(page,fixture.name);await expect(frame.locator('body')).toContainText(/V4\.58\.579/i);const work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();const report=work.locator('[data-testid="sponsor-reports"]');
  const reading=actualResponse(page,'getSponsorReport',fixture.planId);await report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button').filter({hasText:'Numeric commitment and overload'}).click();expect((await reading).report).toEqual(source.summary);await expect(report.locator('[data-testid="report-forecast"]')).toContainText('P50 2026-09-14 · P80 2026-09-14 · P90 2026-09-15');
  await settledScreenshot(report.locator('[data-testid="report-forecast"]'),{path:info.outputPath('portable-retained-forecast-before-download.png')});stage('download-wait-started');const pending=page.waitForEvent('download',{timeout:120000});pending.catch(()=>{});await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();stage('download-button-clicked');const download=await pending;stage('download-event',{filename:download.suggestedFilename()});expect(download.suggestedFilename()).toBe(`sponsor-report-${source.summary.id}.html`);
  const output=info.outputPath('portable-retained-report.html');await download.saveAs(output);stage('download-saved');expect(await download.failure()).toBeNull();const html=fs.readFileSync(output,'utf8');expect(html).toContain('WFH-2847');expect(html).toContain('2026-09-07');expect(html).toContain('2026-09-15');expect((html.match(/data-issue-key=/g)||[]).length).toBe(1);expect((html.match(/data-target-key=/g)||[]).length).toBe(2);expect((html.match(/data-capacity-key=/g)||[]).length).toBe(1);expect(html).not.toMatch(/<(script|iframe|img|link)\b/i);journal.saved={path:output,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')};retain();
  const timelinePage=await rpc.invoke('getSponsorReportPage',{planId:fixture.planId,reportId:source.summary.id,section:'timeline',page:0});expect(timelinePage.success).toBe(true);expect(timelinePage.page.rows).toHaveLength(1);const timeline=timelinePage.page.rows[0];expect(timeline).toMatchObject({key:'WFH-2847',summary:fixture.name+' numeric report 20h',startDate:'2026-09-07',dueDate:'2026-09-11',duration:5});
  stage('local-document-opening');const doc=await page.context().newPage();let documentError:any,needsLocalHeadlessPrint=false;const external:string[]=[];doc.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  try{
   await doc.goto(pathToFileURL(output).href);stage('local-document-opened');expect(external).toEqual([]);await expect(doc.locator('script,iframe,img,link')).toHaveCount(0);const row=doc.locator('tr[data-issue-key]');await expect(row).toHaveCount(1);expect((await row.locator('td').allTextContents()).slice(0,6)).toEqual([timeline.key,timeline.summary,timeline.startDate,timeline.dueDate,'5',timeline.statusCategory]);await expect(row.locator('.track .bar')).toHaveCount(1);
   await expect(doc.locator('tr[data-target-key]')).toHaveCount(2);for(const target of source.targetRows){const tr=doc.locator(`tr[data-target-key="${target.key}"]`);expect(await tr.locator('td').allTextContents()).toEqual([`${target.name} · ${target.date}`,`${target.scopeLabel} (release ${fixture.version.id}) · 1 tasks`,target.plannedFinish,'2026-09-14 / 2026-09-14 / 2026-09-15',target.name==='Scoped earliest'?'0%':'100%',`${target.state}${target.reason?' — '+target.reason:''}${target.forecastReason?' — '+target.forecastReason:''}`]);}
   const cap=source.capacityRows[0];await expect(doc.locator('tr[data-capacity-key]')).toHaveCount(1);expect(await doc.locator('tr[data-capacity-key] td').allTextContents()).toEqual([`${cap.name} (${cap.personId})`,'2026-09-07','20','12','0','overloaded']);
   const availability=doc.locator('section').filter({has:doc.getByRole('heading',{name:'Included availability assumptions',exact:true})});expect(await availability.locator('tbody tr td').allTextContents()).toEqual([`${source.availabilityRows[0].name} (${source.availabilityRows[0].key})`,'8h/day × 50% part-time × 75% after reserve; weekdays Mon, Tue, Wed, Thu, Fri; leave 2026-09-10']);await expect(doc.locator('body')).toContainText('P50 2026-09-14 · P80 2026-09-14 · P90 2026-09-15');await expect(doc.locator('body')).toContainText('saved availability revision 35');await expect(doc.locator('body')).not.toContainText('LZPT-');
   journal.allVisibleFieldsVerified=true;stage('all-html-fields-verified');await settledScreenshot(doc,{subject:row,path:info.outputPath('portable-retained-complete-html.png'),fullPage:true});stage('same-context-pdf-started');
   try{await doc.pdf({path:info.outputPath('portable-retained-report.pdf'),printBackground:true,preferCSSPageSize:true});stage('same-context-pdf-saved');journal.pdfMode='same-portable-context';}
   catch(error){if(!/PrintToPDF is not implemented|Printing is not available|Headless mode is required/i.test(String(error)))throw error;needsLocalHeadlessPrint=true;stage('same-context-pdf-unsupported',{message:String(error)});}
  }catch(error){documentError=error;stage('local-document-error',{message:String(error)});throw error;}finally{try{await doc.close();stage('local-document-closed');}catch(error){throw new AggregateError([...(documentError?[documentError]:[]),error],'Local report document and close failure');}}
  expect((await rpc.invoke('getSponsorReport',{planId:fixture.planId,reportId:source.summary.id})).report).toEqual(source.summary);const afterPlan=await getTestState('lz-ppm',{what:'plan',planId:fixture.planId});expect(afterPlan.issues).toEqual(originalPlan.issues);journal.retainedDataUnchanged=true;retain();
  if(needsLocalHeadlessPrint){
   stage('owned-context-clean-close-started');await page.context().tracing.stopChunk({path:info.outputPath('portable-diagnostic-trace.zip')});await page.context().close();stage('owned-context-clean-close-completed');
   const printer=await chromium.launch({headless:true});try{const printPage=await printer.newPage();await printPage.goto(pathToFileURL(output).href);await printPage.pdf({path:info.outputPath('portable-retained-report.pdf'),printBackground:true,preferCSSPageSize:true});journal.pdfMode='fresh-unauthenticated-headless-local-file';stage('local-headless-pdf-saved');}finally{await printer.close();}
  }
  stage('diagnostic-complete');
 }catch(error){stage('original-error',{message:String(error)});throw error;}finally{rpc.stop();}
});
