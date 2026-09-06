import {withReportDeparture,setReportDepartureOwner,stopReportUi,reportDepartureFailure} from './report-departure';
import {createReportThroughputObserver,observeCall} from './report-throughput-observer.mjs';
import {getTarget} from '../../config/targets';
import {captureReport,cleanupOwnedReportCaptures} from './report-capture';
import {settledScreenshot,waitForAppReady} from './settled-screenshot.mjs';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {test,expect} from '../../fixtures/forge';
import {getTestState as baseGetTestState} from '../../testhook/client';
import {openPlan,scheduleFields,LZPT_PLAN} from './forecast-fixture';
import {actualResponse,currentUserResolver,planning,callOf} from './campaign-ui';
import {table,row,editDuration} from './normalization-owned-fixture';
import {readLzppPopulation} from '../../scripts/lz-ppm-population-audit.mjs';
test.describe.configure({retries:0,timeout:1800000});
const rowFields=(rows:any[])=>rows.map(i=>({key:i.key,id:i.id,summary:i.summary,statusCategory:i.statusCategory??'unknown',startDate:i.startDate??null,dueDate:i.dueDate??null,duration:i.duration??null,buffer:i.buffer||'No',parentKey:i.parentKey??null,predecessors:[...(i.predecessors||[])].sort(),successors:[...(i.successors||[])].sort()})).sort((a,b)=>a.key.localeCompare(b.key));

test('large history and report: existing >2000 Jira issues retain every captured field, complete HTML and terminal rows without mutating the source',async({page},info)=>{
 await withReportDeparture(page,info,async()=>{
 fs.mkdirSync(info.outputDir,{recursive:true});
 const target=getTarget('lz-ppm-dashboard'),appId=target.appId.split('/').at(-1)!;
 const throughput=createReportThroughputObserver({page,extensionId:`ari:cloud:ecosystem::extension/${appId}/${target.envId}/static/ppm-dashboard`,
  emit:(event:any)=>fs.appendFileSync(info.outputPath('large-throughput-events.jsonl'),JSON.stringify(event)+'\n'),
  saveFailure:(id:number,raw:string)=>fs.writeFileSync(info.outputPath(`large-throughput-failure-${id}.json`),raw),
  saveResponse:(id:number,evidence:any)=>fs.writeFileSync(info.outputPath(`large-throughput-response-${id}.json`),JSON.stringify(evidence))});
 const getTestState=(app:string,query:any)=>baseGetTestState(app,query,throughput);
 let originalFailed=false,originalFailure:any;
 try {
 const population=await readLzppPopulation();expect(population.count).toBeGreaterThan(2000);
 if(!population.first||!population.last)throw new Error('Large population must include first and terminal issue controls');
 const keys=population.rows.map((i:any)=>i.key).sort(),name=`[harness-test] Large retained capture ${Date.now().toString(36)}`;
 const registry=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();
 const standing=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});
 let planId:string|undefined,bodyError:any,reportRecovery:any;const journal:any={name,population:{count:population.count,sha256:population.sha256,first:population.first,last:population.last,pages:population.pages,elapsedMs:population.elapsedMs},metrics:{}};
 fs.mkdirSync(info.outputDir,{recursive:true});const retain=()=>fs.writeFileSync(info.outputPath('large-history-journal.json'),JSON.stringify(journal,null,2));retain();
 const rpc=currentUserResolver(page,c=>c?.functionKey==='captureSnapshot'&&c.payload?.planId===planId,{observer:throughput});
 try{
  const start=Date.now(),made=await getTestState('lz-ppm',{what:'createFixture',name,jql:'project = LZPP ORDER BY key ASC'});planId=made.planId;setReportDepartureOwner(page,planId!,name);journal.planId=planId;journal.metrics.indexMs=Date.now()-start;retain();
  expect(made.meta.mode).toBeUndefined();expect(made.meta.calendarKey).toBe('standard');
  expect(made.issues.map((i:any)=>i.key).sort()).toEqual(keys);
  const originalByKey=new Map(population.rows.map((i:any)=>[i.key,i]));
  for(const row of made.issues){const raw:any=originalByKey.get(row.key);expect(String(row.id)).toBe(raw.id);expect(row.summary).toBe(raw.summary);}
  let frame=await table(page,name);
  const rawPlan=await getTestState('lz-ppm',{what:'plan',planId:planId!});expect(rawPlan.meta.mode).toBeUndefined();expect(rawPlan.meta.calendarKey).toBe('standard');const basis=rawPlan.issues;expect(basis.map((i:any)=>i.key).sort()).toEqual(keys);
  // Raw storage, hydrated working UI, and immutable pristine captures are
  // distinct layers. Hydration creates no edit and does not write raw KVS.
  const weekdays=(start:string,due:string)=>{expect(new Date(start+'T12:00:00Z').toISOString().slice(0,10)).toBe(start);expect(new Date(due+'T12:00:00Z').toISOString().slice(0,10)).toBe(due);expect(due>=start).toBe(true);let n=0;for(let t=Date.parse(start+'T12:00:00Z');t<=Date.parse(due+'T12:00:00Z');t+=86400000){const day=new Date(t).getUTCDay();if(day>=1&&day<=5)n++;}return n;};
  for(const item of basis){const raw:any=originalByKey.get(item.key);expect(item.startDate).toBe(raw.start);expect(item.dueDate).toBe(raw.due);expect(item.duration??null).toBe(raw.duration);}
  const rawExpected=rowFields(basis),workingExpected=rawExpected.map(item=>({...item,duration:item.duration??(weekdays(item.startDate,item.dueDate)||null)}));
  fs.writeFileSync(info.outputPath('large-capture-raw-expected.json'),JSON.stringify(rawExpected));fs.writeFileSync(info.outputPath('large-working-report-expected.json'),JSON.stringify(workingExpected));
  const viewStart=Date.now();await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(population.count,{timeout:120000});await waitForAppReady(row(frame,population.first.key));
  const visibleRows=await frame.locator('[data-testid="table-row"]').evaluateAll((rows:any[])=>rows.map(r=>({key:r.getAttribute('data-row-key'),startDate:r.getAttribute('data-row-start'),dueDate:r.getAttribute('data-row-due'),duration:r.getAttribute('data-row-duration')})).sort((a:any,b:any)=>a.key.localeCompare(b.key)));
  expect(visibleRows).toEqual(workingExpected.map(i=>({key:i.key,startDate:i.startDate,dueDate:i.dueDate,duration:i.duration==null?'':String(i.duration)})));journal.metrics.completeWorkingUiReadMs=Date.now()-viewStart;
  journal.workingDurationCounts={};for(const item of workingExpected){const key=String(item.duration);journal.workingDurationCounts[key]=(journal.workingDurationCounts[key]||0)+1;}retain();
  // These measured controls are explicit source keys, not locale-sort endpoints.
  for(const [key,duration] of [['LZPP-1',2],['LZPP-5300',4],['LZPP-6',null]] as const){
   expect(workingExpected.find(i=>i.key===key)?.duration).toBe(duration);const target=row(frame,key);
   await expect(target.locator(':scope > div').nth(5)).toHaveText(duration===null?'Set':`${duration}d`);
   await settledScreenshot(page,{subject:target,path:info.outputPath(`large-working-${key}.png`)});
  }
  let work=await planning(frame);
  const captureRequest=page.waitForRequest((r:any)=>callOf(r)?.functionKey==='captureSnapshot'&&callOf(r)?.payload?.planId===planId);
  await work.getByLabel('Capture name',{exact:true}).fill('Complete large decision');const captureStart=Date.now();const captured=actualResponse(page,'getSnapshot',planId!);await work.getByRole('button',{name:'Capture working plan',exact:true}).click();const snapshot=(await captured).snapshot;journal.metrics.captureAndReadMs=Date.now()-captureStart;journal.metrics.snapshotBytes=Buffer.byteLength(JSON.stringify(snapshot));
  expect(snapshot.mode).toBeUndefined();expect(snapshot.calendar.workingDays).toEqual([1,2,3,4,5]);expect(snapshot.calendar.holidays).toEqual([]);expect(snapshot.issueCount).toBe(population.count);expect(snapshot.issues.map((i:any)=>i.key).sort()).toEqual(keys);expect(rowFields(snapshot.issues)).toEqual(rawExpected);const pristineRequest=callOf(await captureRequest).payload;expect(pristineRequest.changes).toEqual([]);expect(snapshot.workingChangeCount).toBe(0);journal.pristineCapture={changes:pristineRequest.changes,workingChangeCount:snapshot.workingChangeCount};journal.snapshot={id:snapshot.id,hash:snapshot.hash,count:snapshot.issueCount,terminalExpected:rawExpected.find(i=>i.key===population.last!.key),lastExpected:rawExpected.slice(-5),lastSnapshot:rowFields(snapshot.issues).slice(-5)};retain();
  await expect(work.locator('[data-testid="snapshot-detail"]')).toContainText(`${population.count} retained issues`);await settledScreenshot(work,{path:info.outputPath('large-capture-visible-count-and-context.png')});
  // Reopen is another real read, compared across the entire result, not its count.
  frame=await openPlan(page,name);work=await planning(frame);const reread=actualResponse(page,'getSnapshot',planId!);await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Complete large decision'}).click();const reopened=(await reread).snapshot;expect(reopened.hash).toBe(snapshot.hash);expect(reopened.mode).toBeUndefined();expect(reopened.calendar).toEqual(snapshot.calendar);expect(rowFields(reopened.issues)).toEqual(rawExpected);
  await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();const report=work.locator('[data-testid="sponsor-reports"]');await report.getByLabel('Report name',{exact:true}).fill('Every existing performance row');observeCall(throughput,'mark','capture');const reportStart=Date.now();const summary=await captureReport(page,report,planId!,info,{observer:throughput,onRecovery:(error:any)=>{reportRecovery=error;journal.reportRecovery=error.reportState;retain();}});journal.metrics.reportCaptureMs=Date.now()-reportStart;expect(summary.mode).toBeUndefined();expect(summary.calendar).toEqual({calendarName:snapshot.calendar.calendarName??'Unnamed calendar',workingDays:snapshot.calendar.workingDays,holidays:snapshot.calendar.holidays});expect(summary.counts.timeline).toBe(population.count);expect(summary.pages.timeline).toBeGreaterThan(40);journal.report=summary;retain();
  observeCall(throughput,'mark','direct-page-audit');
  const allRows:any[]=[],pageMetrics:any[]=[];
  for(let n=0;n<summary.pages.timeline;n++){
   const start=Date.now(),response=await rpc.invoke('getSponsorReportPage',{planId,reportId:summary.id,section:'timeline',page:n});expect(response.success).toBe(true);const part=response.page;expect(part.page).toBe(n);expect(part.pageCount).toBe(summary.pages.timeline);expect(part.total).toBe(population.count);expect(part.rows.length).toBeGreaterThan(0);allRows.push(...part.rows);pageMetrics.push({page:n,rows:part.rows.length,elapsedMs:Date.now()-start,bytes:Buffer.byteLength(JSON.stringify(response))});
  }
  expect(allRows.map(r=>r.key).sort()).toEqual(keys);
  const reportFields=(rows:any[])=>rows.map(i=>({key:i.key,summary:i.summary,statusCategory:i.statusCategory??'unknown',startDate:i.startDate??null,dueDate:i.dueDate??null,duration:i.duration??null})).sort((a,b)=>a.key.localeCompare(b.key));
  expect(reportFields(allRows)).toEqual(reportFields(workingExpected));journal.metrics.reportPageReads=pageMetrics;journal.reportTerminalRows=allRows.slice(-5);retain();
  observeCall(throughput,'mark','ui-download');
  const downloadStart=Date.now(),download=page.waitForEvent('download',{timeout:600000});await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe(`sponsor-report-${summary.id}.html`);const target=info.outputPath('large-actual-report.html');await file.saveAs(target);journal.metrics.completeDownloadMs=Date.now()-downloadStart;journal.metrics.htmlBytes=fs.statSync(target).size;retain();
  const html=await page.context().newPage(),external:string[]=[];html.on('request',(r:any)=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  let htmlError:any;
  try{
   const renderStart=Date.now();await html.goto(pathToFileURL(target).href);await expect(html.locator('tr[data-issue-key]')).toHaveCount(population.count);journal.metrics.htmlRenderMs=Date.now()-renderStart;
   const rendered=await html.locator('tr[data-issue-key]').evaluateAll((rows:any[])=>rows.map(row=>({key:row.getAttribute('data-issue-key'),cells:[...row.querySelectorAll('td')].map((cell:any)=>cell.textContent.trim())})));
   expect(rendered.map(r=>r.key).sort()).toEqual(keys);const renderedByKey=new Map(rendered.map(r=>[r.key,r]));
   for(const item of workingExpected){const row:any=renderedByKey.get(item.key);expect(row.cells.slice(0,6)).toEqual([item.key,item.summary,item.startDate??'—',item.dueDate??'—',String(item.duration??'—'),item.statusCategory]);}
   await expect(html.locator('script,iframe,img,link')).toHaveCount(0);expect(external).toEqual([]);
   for(const [label,key]of [['first',population.first.key],['terminal',population.last.key]]){await html.locator(`tr[data-issue-key="${key}"]`).scrollIntoViewIfNeeded();await settledScreenshot(html,{subject:html.locator(`tr[data-issue-key="${key}"]`),path:info.outputPath(`large-report-${label}-row-visible.png`)});}
   journal.renderedTerminalRow=renderedByKey.get(population.last.key);journal.allHtmlFieldsVerified=true;retain();
  }catch(error){htmlError=error;throw error;}finally{try{await html.close();}catch(error){throw new AggregateError([...(htmlError?[htmlError]:[]),error],'Large HTML body/close failures');}}
  observeCall(throughput,'mark','source-checks');
  const again=await rpc.invoke('getSnapshot',{planId,snapshotId:snapshot.id});expect(again.success).toBe(true);expect(again.snapshot.hash).toBe(snapshot.hash);expect(rowFields(again.snapshot.issues)).toEqual(rawExpected);
  // A real isolated local duration edit must survive capture without rewriting
  // every pristine raw duration. Choose an unparented terminal leaf so the exact
  // independently expected result has one change and no cascade ambiguity.
  const parentKeys=new Set(basis.map((i:any)=>i.parentKey).filter(Boolean)),byKey=new Map(basis.map((i:any)=>[i.key,i]));
  const editable=workingExpected.find(i=>!parentKeys.has(i.key)&&!((byKey.get(i.key) as any)?.children||[]).length&&!i.parentKey&&!i.predecessors.length&&!i.successors.length&&i.buffer!=='Yes'&&i.duration!==9&&i.duration!=null&&new Date(i.startDate+'T12:00:00Z').getUTCDay()>=1&&new Date(i.startDate+'T12:00:00Z').getUTCDay()<=5);expect(editable).toBeTruthy();
  let editedDue=editable!.startDate,count=1;while(count<9){editedDue=new Date(Date.parse(editedDue+'T12:00:00Z')+86400000).toISOString().slice(0,10);const day=new Date(editedDue+'T12:00:00Z').getUTCDay();if(day>=1&&day<=5)count++;}
  frame=await table(page,name);await editDuration(frame,editable!.key,'9');await expect(row(frame,editable!.key)).toHaveAttribute('data-row-duration','9');await expect(row(frame,editable!.key)).toHaveAttribute('data-row-due',editedDue);
  work=await planning(frame);await work.getByLabel('Capture name',{exact:true}).fill('Large explicit duration decision');const changedRequest=page.waitForRequest((r:any)=>callOf(r)?.functionKey==='captureSnapshot'&&callOf(r)?.payload?.planId===planId),changedRead=actualResponse(page,'getSnapshot',planId!);await work.getByRole('button',{name:'Capture working plan',exact:true}).click();const changedSnapshot=(await changedRead).snapshot,submitted=callOf(await changedRequest).payload.changes;
  expect(submitted).toHaveLength(1);expect(submitted[0]).toMatchObject({key:editable!.key,duration:9,startDate:editable!.startDate,dueDate:editedDue});expect(changedSnapshot.workingChangeCount).toBe(1);
  expect(rowFields(changedSnapshot.issues)).toEqual(rawExpected.map(i=>i.key===editable!.key?{...i,duration:9,dueDate:editedDue}:i));expect(changedSnapshot.issues.find((i:any)=>i.key===editable!.key).capturedDuration).toBe(true);
  journal.explicitDurationCapture={key:editable!.key,duration:9,dueDate:editedDue,submitted,snapshotId:changedSnapshot.id};retain();
  const originalAgain=await rpc.invoke('getSnapshot',{planId,snapshotId:snapshot.id});expect(originalAgain.success).toBe(true);expect(originalAgain.snapshot.hash).toBe(snapshot.hash);expect(rowFields(originalAgain.snapshot.issues)).toEqual(rawExpected);
  expect(rowFields((await getTestState('lz-ppm',{what:'plan',planId:planId!})).issues)).toEqual(rawExpected);
  const after=await readLzppPopulation();expect(after.rows).toEqual(population.rows);journal.jiraPopulationUnchanged=true;retain();
 }catch(error){bodyError=error;journal.bodyError={name:(error as any)?.name,message:String((error as any)?.message||error)};retain();throw error;}finally{
  observeCall(throughput,'mark','final-cleanup');
  rpc.stop();const cleanupErrors:any[]=[];const attempt=async(stage:string,work:()=>Promise<void>)=>{try{await work();}catch(error){cleanupErrors.push(error);journal.cleanupErrors??=[];journal.cleanupErrors.push({stage,message:String((error as any)?.message||error)});retain();}};
  await attempt('stop-owned-ui',async()=>stopReportUi(page,async()=>{if(!page.isClosed())await page.goto('about:blank').catch(()=>page.close());}));
  const departureFailure=reportDepartureFailure(page);if(departureFailure){reportRecovery=departureFailure;journal.reportRecovery=departureFailure.reportState;retain();}
  await attempt('resolve-owned-plan',async()=>{if(!planId)planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;});
  if(planId)await attempt('report-job-cleanup',async()=>{await cleanupOwnedReportCaptures(page,planId!,info,{observer:throughput,onRecovery:(e:any)=>{reportRecovery=e;journal.reportRecovery=e.reportState;retain();}});});
  if(planId&&!reportRecovery)await attempt('delete-owned-plan',async()=>{const current=await getTestState('lz-ppm',{what:'plan',planId:planId!});expect(current.meta.name).toBe(name);await getTestState('lz-ppm',{what:'clearDrafts',planId:planId!});await getTestState('lz-ppm',{what:'deleteFixture',planId:planId!});journal.ownedPlanCleaned=true;retain();});
  await attempt('registry-integrity',async()=>{expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(reportRecovery?[...registry,planId].sort():registry);});
  await attempt('standing-source-integrity',async()=>{expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(standing.issues));});
  if(reportRecovery){journal.retainedForRecovery={planId,reason:reportRecovery.message};cleanupErrors.push(reportRecovery);}retain();if(cleanupErrors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...cleanupErrors],'Large history body/cleanup failures');
 }
 } catch(error) {originalFailed=true;originalFailure=error;throw error;}
 finally {
  const observed=await throughput.finish({requireCapture:true});fs.writeFileSync(info.outputPath('large-throughput-final.json'),JSON.stringify(observed,null,2));
  if(!observed.complete)throw new AggregateError([...(originalFailed?[originalFailure]:[]),new Error('Passive throughput observation recorded failures or incomplete requests; inspect retained events')],'Large history and throughput evidence failures');
 }
 });
});
