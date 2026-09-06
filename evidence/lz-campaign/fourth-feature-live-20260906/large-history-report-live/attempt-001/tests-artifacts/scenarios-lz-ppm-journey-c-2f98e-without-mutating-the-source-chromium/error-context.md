# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-large-history.spec.ts >> large history and report: existing >2000 Jira issues retain every captured field, complete HTML and terminal rows without mutating the source
- Location: scenarios/lz-ppm/journey-campaign-large-history.spec.ts:12:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: null
```

# Test source

```ts
  1  | import {settledScreenshot} from './settled-screenshot.mjs';
  2  | import fs from 'node:fs';
  3  | import {pathToFileURL} from 'node:url';
  4  | import {test,expect} from '../../fixtures/forge';
  5  | import {getTestState} from '../../testhook/client';
  6  | import {openPlan,scheduleFields,LZPT_PLAN} from './forecast-fixture';
  7  | import {actualResponse,currentUserResolver,planning} from './campaign-ui';
  8  | import {readLzppPopulation} from '../../scripts/lz-ppm-population-audit.mjs';
  9  | test.describe.configure({retries:0,timeout:1800000});
  10 | const rowFields=(rows:any[])=>rows.map(i=>({key:i.key,id:i.id,summary:i.summary,statusCategory:i.statusCategory??'unknown',startDate:i.startDate??null,dueDate:i.dueDate??null,duration:i.duration??null,buffer:i.buffer||'No',parentKey:i.parentKey??null,predecessors:[...(i.predecessors||[])].sort(),successors:[...(i.successors||[])].sort()})).sort((a,b)=>a.key.localeCompare(b.key));
  11 | 
  12 | test('large history and report: existing >2000 Jira issues retain every captured field, complete HTML and terminal rows without mutating the source',async({page},info)=>{
  13 |  const population=await readLzppPopulation();expect(population.count).toBeGreaterThan(2000);
  14 |  if(!population.first||!population.last)throw new Error('Large population must include first and terminal issue controls');
  15 |  const keys=population.rows.map((i:any)=>i.key).sort(),name=`[harness-test] Large retained capture ${Date.now().toString(36)}`;
  16 |  const registry=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();
  17 |  const standing=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});
  18 |  let planId:string|undefined;const journal:any={name,population:{count:population.count,sha256:population.sha256,first:population.first,last:population.last,pages:population.pages,elapsedMs:population.elapsedMs},metrics:{}};
  19 |  fs.mkdirSync(info.outputDir,{recursive:true});const retain=()=>fs.writeFileSync(info.outputPath('large-history-journal.json'),JSON.stringify(journal,null,2));retain();
  20 |  const rpc=currentUserResolver(page,c=>c?.functionKey==='captureSnapshot'&&c.payload?.planId===planId);
  21 |  try{
  22 |   const start=Date.now(),made=await getTestState('lz-ppm',{what:'createFixture',name,jql:'project = LZPP ORDER BY key ASC'});planId=made.planId;journal.planId=planId;journal.metrics.indexMs=Date.now()-start;retain();
  23 |   expect(made.issues.map((i:any)=>i.key).sort()).toEqual(keys);
  24 |   const originalByKey=new Map(population.rows.map((i:any)=>[i.key,i]));
  25 |   for(const row of made.issues){const raw:any=originalByKey.get(row.key);expect(String(row.id)).toBe(raw.id);expect(row.summary).toBe(raw.summary);}
  26 |   let frame=await openPlan(page,name),work=await planning(frame);
  27 |   const basis=(await getTestState('lz-ppm',{what:'plan',planId:planId!})).issues;expect(basis.map((i:any)=>i.key).sort()).toEqual(keys);
  28 |   // Independent calendar oracle: this owned plan is Standard Mon-Fri, no holidays.
  29 |   // Jira stores no declared duration in this bed, so hydration must count its dates.
  30 |   const weekdays=(start:string,due:string)=>{let n=0;for(let t=Date.parse(start+'T12:00:00Z');t<=Date.parse(due+'T12:00:00Z');t+=86400000){const day=new Date(t).getUTCDay();if(day>=1&&day<=5)n++;}return n;};
> 31 |   for(const row of basis){const raw:any=originalByKey.get(row.key);expect(row.startDate).toBe(raw.start);expect(row.dueDate).toBe(raw.due);expect(row.duration).toBe(raw.duration??weekdays(raw.start,raw.due));}
     |                                                                                                                                                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  32 |   const expected=rowFields(basis);fs.writeFileSync(info.outputPath('large-capture-expected.json'),JSON.stringify(expected));
  33 |   await work.getByLabel('Capture name',{exact:true}).fill('Complete large decision');const captureStart=Date.now();const captured=actualResponse(page,'getSnapshot',planId!);await work.getByRole('button',{name:'Capture working plan',exact:true}).click();const snapshot=(await captured).snapshot;journal.metrics.captureAndReadMs=Date.now()-captureStart;journal.metrics.snapshotBytes=Buffer.byteLength(JSON.stringify(snapshot));
  34 |   expect(snapshot.calendar.workingDays).toEqual([1,2,3,4,5]);expect(snapshot.calendar.holidays).toEqual([]);expect(snapshot.issueCount).toBe(population.count);expect(snapshot.issues.map((i:any)=>i.key).sort()).toEqual(keys);expect(rowFields(snapshot.issues)).toEqual(expected);journal.snapshot={id:snapshot.id,hash:snapshot.hash,count:snapshot.issueCount,lastExpected:expected.slice(-5),lastSnapshot:rowFields(snapshot.issues).slice(-5)};retain();
  35 |   await expect(work.locator('[data-testid="snapshot-detail"]')).toContainText(`${population.count} retained issues`);await settledScreenshot(work,{path:info.outputPath('large-capture-visible-count-and-context.png')});
  36 |   // Reopen is another real read, compared across the entire result, not its count.
  37 |   frame=await openPlan(page,name);work=await planning(frame);const reread=actualResponse(page,'getSnapshot',planId!);await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Complete large decision'}).click();const reopened=(await reread).snapshot;expect(reopened.hash).toBe(snapshot.hash);expect(rowFields(reopened.issues)).toEqual(expected);
  38 |   await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();const report=work.locator('[data-testid="sponsor-reports"]');await report.getByLabel('Report name',{exact:true}).fill('Every existing performance row');const reportStart=Date.now(),reportRead=actualResponse(page,'captureSponsorReport',planId!);await report.getByRole('button',{name:'Capture sponsor report',exact:true}).click();const summary=(await reportRead).report;journal.metrics.reportCaptureMs=Date.now()-reportStart;expect(summary.counts.timeline).toBe(population.count);expect(summary.pages.timeline).toBeGreaterThan(40);journal.report=summary;retain();
  39 |   const allRows:any[]=[],pageMetrics:any[]=[];
  40 |   for(let n=0;n<summary.pages.timeline;n++){
  41 |    const start=Date.now(),response=await rpc.invoke('getSponsorReportPage',{planId,reportId:summary.id,section:'timeline',page:n});expect(response.success).toBe(true);const part=response.page;expect(part.page).toBe(n);expect(part.pageCount).toBe(summary.pages.timeline);expect(part.total).toBe(population.count);expect(part.rows.length).toBeGreaterThan(0);allRows.push(...part.rows);pageMetrics.push({page:n,rows:part.rows.length,elapsedMs:Date.now()-start,bytes:Buffer.byteLength(JSON.stringify(response))});
  42 |   }
  43 |   expect(allRows.map(r=>r.key).sort()).toEqual(keys);
  44 |   const reportFields=(rows:any[])=>rows.map(i=>({key:i.key,summary:i.summary,statusCategory:i.statusCategory??'unknown',startDate:i.startDate??null,dueDate:i.dueDate??null,duration:i.duration??null})).sort((a,b)=>a.key.localeCompare(b.key));
  45 |   expect(reportFields(allRows)).toEqual(reportFields(expected));journal.metrics.reportPageReads=pageMetrics;journal.reportTerminalRows=allRows.slice(-5);retain();
  46 |   const downloadStart=Date.now(),download=page.waitForEvent('download',{timeout:600000});await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe(`sponsor-report-${summary.id}.html`);const target=info.outputPath('large-actual-report.html');await file.saveAs(target);journal.metrics.completeDownloadMs=Date.now()-downloadStart;journal.metrics.htmlBytes=fs.statSync(target).size;retain();
  47 |   const html=await page.context().newPage(),external:string[]=[];html.on('request',(r:any)=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  48 |   try{
  49 |    const renderStart=Date.now();await html.goto(pathToFileURL(target).href);await expect(html.locator('tr[data-issue-key]')).toHaveCount(population.count);journal.metrics.htmlRenderMs=Date.now()-renderStart;
  50 |    const rendered=await html.locator('tr[data-issue-key]').evaluateAll((rows:any[])=>rows.map(row=>({key:row.getAttribute('data-issue-key'),cells:[...row.querySelectorAll('td')].map((cell:any)=>cell.textContent.trim())})));
  51 |    expect(rendered.map(r=>r.key).sort()).toEqual(keys);const renderedByKey=new Map(rendered.map(r=>[r.key,r]));
  52 |    for(const item of expected){const row:any=renderedByKey.get(item.key);expect(row.cells.slice(0,6)).toEqual([item.key,item.summary,item.startDate??'—',item.dueDate??'—',String(item.duration??'—'),item.statusCategory]);}
  53 |    await expect(html.locator('script,iframe,img,link')).toHaveCount(0);expect(external).toEqual([]);
  54 |    for(const [label,key]of [['first',population.first.key],['terminal',population.last.key]]){await html.locator(`tr[data-issue-key="${key}"]`).scrollIntoViewIfNeeded();await settledScreenshot(html,{path:info.outputPath(`large-report-${label}-row-visible.png`)});}
  55 |    journal.renderedTerminalRow=renderedByKey.get(population.last.key);journal.allHtmlFieldsVerified=true;retain();
  56 |   }finally{await html.close();}
  57 |   const again=await rpc.invoke('getSnapshot',{planId,snapshotId:snapshot.id});expect(again.success).toBe(true);expect(again.snapshot.hash).toBe(snapshot.hash);expect(rowFields(again.snapshot.issues)).toEqual(expected);
  58 |   const after=await readLzppPopulation();expect(after.rows).toEqual(population.rows);journal.jiraPopulationUnchanged=true;retain();
  59 |  }finally{
  60 |   rpc.stop();if(!page.isClosed())await page.goto('about:blank').catch(()=>page.close());if(!planId)planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;
  61 |   if(planId){const current=await getTestState('lz-ppm',{what:'plan',planId});expect(current.meta.name).toBe(name);await getTestState('lz-ppm',{what:'clearDrafts',planId});await getTestState('lz-ppm',{what:'deleteFixture',planId});}
  62 |   expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(registry);expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(standing.issues));journal.ownedPlanCleaned=true;retain();
  63 |  }
  64 | });
  65 | 
```