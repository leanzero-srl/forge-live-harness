# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-seventeenth-forecast-resume.spec.ts >> seventeenth forecast resume: same retained5300 job completes exact40-run report and HTML without cleanup
- Location: scenarios/lz-ppm/campaign-seventeenth-forecast-resume.spec.ts:20:1

# Error details

```
AggregateError: Retained diagnostic/recovery and independent audit errors
```

```
Error: Limits for the current installation have been exceeded

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: Limits for the current installation have been exceeded

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: testState lz-ppm -> 500: {"error":"Limits for the current installation have been exceeded","stack":"ForgeKvsError: Limits for the current installation have been exceeded\n    at checkResponseError (webpack://leanzero-management-forge/node_modules/@forge/kvs/out/utils/error-handling.js:41:1)\n    at process.processTicksAndRe
```

```
Error: testState lz-ppm -> 500: {"error":"Limits for the current installation have been exceeded","stack":"ForgeKvsError: Limits for the current installation have been exceeded\n    at checkResponseError (webpack://leanzero-management-forge/node_modules/@forge/kvs/out/utils/error-handling.js:41:1)\n    at process.processTicksAndRe
```

```
Error: testState lz-ppm -> 500: {"error":"Limits for the current installation have been exceeded","stack":"ForgeKvsError: Limits for the current installation have been exceeded\n    at checkResponseError (webpack://leanzero-management-forge/node_modules/@forge/kvs/out/utils/error-handling.js:41:1)\n    at process.processTicksAndRe
```

```
Error: Limits for the current installation have been exceeded

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1  | // Exact retained same-job continuation. Only acknowledged advances; report/resources retained for root inspection.
  2  | import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
  3  | import {test,expect} from '../../fixtures/forge';import {getTestState} from '../../testhook/client';import {getHarnessLaunchReceipt} from '../../forge/browser';
  4  | import {openPlans,scheduleFields,LZPT_PLAN} from './forecast-fixture';import {actualResponse,callEnvelope} from './campaign-ui';import {replayHeaders} from './replay-headers.mjs';
  5  | import {observeCaptureProbe,verifyCaptureProbe} from './report-capture-cleanup.mjs';import {retained,checkedJob} from './seventeenth-report-recovery-contract.mjs';
  6  | import {admitSource,verifySourceResult} from './seventeenth-source-contract.mjs';
  7  | import {sourceOracle,hash as canonicalHash} from './seventeenth-source-oracle.mjs';
  8  | import {admitForecastResume,resumeToPublication,preservedArtifacts,uiRequestClass} from './seventeenth-forecast-resume-contract.mjs';
  9  | import {pinnedForecast,verifyPublished,verifyReportPage,expectedHtml} from './seventeenth-forecast-report-oracle.mjs';
  10 | import {openPlan} from './forecast-fixture';import {planning} from './campaign-ui';import {settledScreenshot} from './settled-screenshot.mjs';import {pathToFileURL} from 'node:url';
  11 | import {get,BASE} from '../../data/jira.mjs';import {admitPackedFixture} from './report-packed-upgrade-contract.mjs';
  12 | const {planId,jobId,reportId,requestId,snapshotId,name}=retained;
  13 | const originals=[LZPT_PLAN,'plan-mta3aw3t-6dyijd','plan-mtbrlh8n-7ghw8u'].sort(),ownedRegistry=[...originals,planId].sort();
  14 | const archived=path.resolve('evidence/lz-campaign/seventeenth-packed-report-live-20260906/large-history-report-live/attempt-001/tests-artifacts/scenarios-lz-ppm-journey-c-2f98e-without-mutating-the-source-chromium');
  15 | const sha=(value:any)=>createHash('sha256').update(value).digest('hex');
  16 | const canonical=(x:any):any=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
  17 | const fields=(rows:any[])=>rows.map(i=>({key:i.key,id:i.id,summary:i.summary,statusCategory:i.statusCategory??'unknown',startDate:i.startDate??null,dueDate:i.dueDate??null,duration:i.duration??null,buffer:i.buffer||'No',parentKey:i.parentKey??null,predecessors:[...(i.predecessors||[])].sort(),successors:[...(i.successors||[])].sort()})).sort((a,b)=>a.key.localeCompare(b.key));
  18 | const expectedPrefs={success:true,version:65,settings:{selectedPlanIds:[],profiles:{},issueChoices:{}}};
  19 | test.describe.configure({retries:0,timeout:2400000});
  20 | test('seventeenth forecast resume: same retained5300 job completes exact40-run report and HTML without cleanup',async({page},info)=>{
  21 |  expect(process.env.LZ_SEVENTEENTH_FORECAST_PHASE).toBe('resume');
  22 |  expect(BASE).toBe('https://wolfaenpak.atlassian.net');const fixtureBytes=fs.readFileSync(path.resolve('tests/report-packed-upgrade/fixture-read.json'));expect(sha(fixtureBytes)).toBe('bac0f90bddbe0d6b368564c929e3931044a590113a2250dec04a3e3db6fd5d1a');const fixture=JSON.parse(fixtureBytes.toString());expect(fixture.first).toEqual(fixture.second);
  23 |  const previousPath=path.resolve('evidence/lz-campaign/seventeenth-retained-analysis-diagnostic-20260906/artifacts/scenarios-lz-ppm-campaign--8294a-pendent-integrity-preserved-chromium/seventeenth-advance.json');const previousBytes=fs.readFileSync(previousPath),previous=JSON.parse(previousBytes.toString());const latestPath=path.resolve('evidence/lz-campaign/seventeenth-context-first-diagnostic-20260906/artifacts/scenarios-lz-ppm-campaign--bc021-pendent-integrity-preserved-chromium/seventeenth-context-first-advance.json');const latestBytes=fs.readFileSync(latestPath),latest=JSON.parse(latestBytes.toString());const preludePath=path.resolve('evidence/lz-campaign/seventeenth-prelude-diagnostic-20260906/artifacts/scenarios-lz-ppm-campaign--0a513-pendent-integrity-preserved-chromium/seventeenth-prelude-advance.json');const preludeBytes=fs.readFileSync(preludePath),prelude=JSON.parse(preludeBytes.toString());const forensicPath=path.resolve('evidence/lz-campaign/seventeenth-forensic-readonly-20260906/artifacts/scenarios-lz-ppm-campaign--bce08-eserve-exact-retained-state-chromium/seventeenth-forensic.json');const forensicBytes=fs.readFileSync(forensicPath),forensic=JSON.parse(forensicBytes.toString());const previousSource=admitSource(forensic,sha(forensicBytes),prelude,sha(preludeBytes),latest,sha(latestBytes),previous,sha(previousBytes),Date.now());
  24 |  const sourcePath=path.resolve('evidence/lz-campaign/seventeenth-source-return-readonly-20260906/artifacts/scenarios-lz-ppm-campaign--755d0-eserve-exact-retained-state-chromium/seventeenth-source.json'),sourceBytes=fs.readFileSync(sourcePath),sourceReceipt=JSON.parse(sourceBytes.toString()),previousAdmitted=admitForecastResume(sourceReceipt,sha(sourceBytes),previousSource);
  25 |  const originalBytes=fs.readFileSync(path.join(archived,'large-history-journal.json'));expect(sha(originalBytes)).toBe('3b47f1e7f32779ebf2ad9671d09aaded34e6052e2236e875e43166bcbb296617');const original=JSON.parse(originalBytes.toString());
  26 |  const rawBytes=fs.readFileSync(path.join(archived,'large-capture-raw-expected.json'));expect(sha(rawBytes)).toBe('30117abfe6ad551e6c5a8d8ceb4d8622e43e51258af8659026b8d25ca1641709');const expectedRows=JSON.parse(rawBytes.toString());expect(expectedRows).toHaveLength(5300);
  27 |  const protocolBytes=fs.readFileSync(path.join(archived,'report-capture-protocol.json'));expect(sha(protocolBytes)).toBe('556e97bad26581731a88d2098c0f178e00808bfcb03ee4aee5099945d8cd7211');const initialJob=JSON.parse(protocolBytes.toString()).job;checkedJob(initialJob);expect(initialJob).toMatchObject({checkpoint:78,state:'active',cleanupDone:false});
  28 |  const receipt=getHarnessLaunchReceipt(page.context());if(!receipt||receipt.mode!=='portable-chrome152')throw new Error('Known portable Chrome152 receipt required');expect(receipt).toMatchObject({mode:'portable-chrome152',browserVersion:'152.0.7977.76',principalSha256:'b4cb5211a5e4d44c9f3a6bc909588c2fe62162358d4b0c04da52aa6977433769',executableSha256:'755178ee89130a6f1c94cc4ecb2289fe74240db3e7efe9ec69a6cfcd4b93a6ee',frameworkSha256:'bfea9981cc61dfa72d847c920f274e4e96e362954f451198d8ee1650cbefb2e6'});expect(receipt!.uiVersion).toBe(process.env.LZ_EXPECTED_UI_VERSION);
  29 |  const journal:any={phase:"resume",sourceReceipt:{path:sourcePath,sha256:sha(sourceBytes)},retained,receipt,forensicDiagnostic:{path:forensicPath,sha256:sha(forensicBytes)},preludeDiagnostic:{path:preludePath,sha256:sha(preludeBytes)},previousDiagnostic:{path:latestPath,sha256:sha(latestBytes)},olderDiagnostic:{path:previousPath,sha256:sha(previousBytes)},events:[],probes:[],advanceCalls:0,publicationObserved:false,sourceAndPreferencesPreserved:false,completed:false};fs.mkdirSync(info.outputDir,{recursive:true});const save=()=>fs.writeFileSync(info.outputPath('seventeenth-forecast-resume.json'),JSON.stringify(journal,null,2));const record=(stage:string,value:any={})=>{journal.events.push({stage,time:new Date().toISOString(),value});save();};save();
  30 |  let wire:any,ready=false,bodyError:any,originalSource:any,originalOwned:any,planDeleted=false,admittedProbe:any,publishedProbe:any;
  31 |  const capture=(req:any)=>{const envelope=callEnvelope(req);if(envelope?.variables?.input?.payload?.call?.functionKey==='getCapacitySettings')wire={url:req.url(),data:envelope,headers:req.allHeaders()};};page.on('request',capture);
  32 |  const forbiddenUi:any[]=[];const blockUiWrites=async(route:any)=>{const call=callEnvelope(route.request())?.variables?.input?.payload?.call,classification=uiRequestClass(call);if(classification==='forbidden'){forbiddenUi.push(call);record('forbidden-ui-write-blocked',call);await route.abort('blockedbyclient');return;}if(classification==='owned-presence')record('owned-ui-presence',call);await route.continue();};await page.route('**/*',blockUiWrites);
  33 |  const allowed=new Set(['getCapacitySettings','getDraft','getActiveDrafts','getLockStatus','getSponsorReportCapture','getSnapshot','getBaseline','listSponsorReports','getSponsorReport','getSponsorReportPage','advanceSponsorReportCapture']);
  34 |  const rawInvoke=async(key:string,payload:any={})=>{
  35 |   expect(allowed.has(key)).toBe(true);expect(wire).toBeTruthy();
  36 |   const envelope=structuredClone(wire.data);envelope.variables.input.payload.call={functionKey:key,payload};
  37 |   const startedMs=Date.now();try{const response=await page.request.post(wire.url,{headers:replayHeaders(await wire.headers),data:JSON.stringify(envelope),maxRetries:0,maxRedirects:0,timeout:60000});const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=null;}
  38 |    const returnedMs=Date.now(),extension=data?.data?.invokeExtension;const observed={startedMs,returnedMs,elapsedMs:returnedMs-startedMs,...(key==='advanceSponsorReportCapture'?{raw:text,responseBytes:Buffer.byteLength(text),responseSha256:sha(text)}:{}),httpStatus:response.status(),outerSuccess:extension?.success??null,body:extension?.response?.body??null,errors:extension?.errors??data?.errors??null,...(!data?{nonJson:{bytes:Buffer.byteLength(text),sha256:sha(text)}}:{}),traceId:response.headers()['atl-traceid']??null};record(key,observed);return observed;
  39 |   }catch(error){record('transport-error',{key,message:String(error)});throw error;}
  40 |  };
> 41 |  const invoke=async(key:string,payload:any={})=>{const result=await rawInvoke(key,payload);expect(result.httpStatus).toBe(200);expect(result.outerSuccess).toBe(true);expect(result.body).toBeTruthy();return result.body;};
     |                                                                                                                                                            ^ Error: expect(received).toBe(expected) // Object.is equality
  42 |  const read=async(key:string,payload:any={})=>{const value=await invoke(key,payload);expect(value.success,value.error).toBe(true);return value;};
  43 |  const registry=async(ids:string[])=>{const value=await getTestState('lz-ppm',{what:'plans'});record('registry',value.plans);expect(value.plans.map((p:any)=>p.id).sort()).toEqual(ids);};
  44 |  const source=async()=>{const s=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});const basis={issues:scheduleFields(s.issues),sources:s.meta.sources,calendarKey:s.meta.calendarKey,holidayYears:s.meta.holidayYears,milestones:s.meta.milestones,protectionEnabled:s.meta.protectionEnabled};expect(s.issues).toHaveLength(45);expect(sha(JSON.stringify(basis))).toBe('2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104');return s;};
  45 |  const owned=async()=>{const value=await getTestState('lz-ppm',{what:'plan',planId});record('owned-plan',value);expect(value.meta).toMatchObject({id:planId,name,createdBy:'harness',calendarKey:'standard',sources:[{id:'src-0',type:'jql',label:'harness',query:'project = LZPP ORDER BY key ASC',boardId:null,projectKey:null}]});expect(value.meta.mode).toBeUndefined();expect(fields(value.issues)).toEqual(expectedRows);return value;};
  46 |  const snapshot=async()=>{const value=(await read('getSnapshot',{planId,snapshotId})).snapshot;expect(value).toMatchObject({id:snapshotId,hash:original.snapshot.hash,issueCount:5300,workingChangeCount:0});expect(value.mode).toBeUndefined();expect(value.calendar.workingDays).toEqual([1,2,3,4,5]);expect(value.calendar.holidays).toEqual([]);expect(fields(value.issues)).toEqual(expectedRows);expect(value).toEqual(sourceReceipt.events.find((e:any)=>e.stage==='getSnapshot').value.body.snapshot);return value;};
  47 |  const baseline=async()=>{expect(await invoke('getBaseline',{planId})).toEqual({baseline:null});};
  48 |  const drafts=async(id:string)=>{expect(await read('getDraft',{planId:id})).toEqual({success:true,draft:null});expect(await read('getActiveDrafts',{planId:id})).toEqual({success:true,drafts:{}});};
  49 |  const probe=async()=>observeCaptureProbe(()=>getTestState('lz-ppm',{what:'reportCaptureState',planId,jobId}),(v:any)=>{journal.probes.push(v);save();});
  50 |  const sharedIssue=async()=>{const value=await get(`/rest/api/3/issue/WFH-2820?fields=${fixture.fields}`);record('shared-issue-readonly',value);admitPackedFixture(value,fixture.first);return value;};
  51 | 
  52 |  try{
  53 |   expect((await get('/rest/api/3/myself')).accountId).toBe('712020:937bc860-eec2-4294-a65d-8e0fe7c45086');expect(await sharedIssue()).toEqual(await sharedIssue());
  54 |   originalSource=await source();expect(originalSource).toEqual(sourceReceipt.events.find((e:any)=>e.stage==='original-source').value);record('original-source',originalSource);await registry(ownedRegistry);originalOwned=await owned();
  55 |   const frame=await openPlans(page),pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();expect(await pending).toEqual(expectedPrefs);ready=true;expect(await read('getCapacitySettings')).toEqual(expectedPrefs);for(const id of originals)await drafts(id);await drafts(planId);await baseline();expect(await read('getLockStatus',{planId})).toMatchObject({locked:false});const originalSnapshot=await snapshot();record('snapshot-hash-and-full-fields',{id:snapshotId,hash:originalSnapshot.hash,count:5300});
  56 |   let job=checkedJob((await read('getSponsorReportCapture',{planId,jobId})).job);const before=await probe();admittedProbe=before;verifyCaptureProbe(before,{planId,jobId,...job});
  57 |   expect(job).toEqual(previousAdmitted.job);expect(before).toEqual(previousAdmitted.probe);expect(job).toEqual(initialJob);expect(before).toEqual(original.reportRecovery.probes[0]);expect(before.privateArtifacts).toHaveLength(134);expect(before.publicArtifacts).toEqual([]);expect((await read('listSponsorReports',{planId})).entries).toEqual([]);
  58 |   await page.goto('about:blank');
  59 |   const contextKeyHash=sha(JSON.stringify(`p:${planId}:report-jobs:data:${jobId}:source-context`));const contextArtifact=before.privateArtifacts.find((a:any)=>a.keyHash===contextKeyHash);expect(contextArtifact).toBeTruthy();expect(contextArtifact.present).toBe(true);const metaHash=sha(JSON.stringify(canonical(originalOwned.meta)));
  60 |   const payloadBytes=fs.readFileSync(path.resolve('tests/seventeenth-source-return/capture-payload.json'));expect(sha(payloadBytes)).toBe('08f3c91aad50cf4f6b36a03439b14b2eb98e90704d6f28097f0f0e8a856cabe4');const payload=JSON.parse(payloadBytes.toString()).payload;expect(sha(JSON.stringify(payload))).toBe(JSON.parse(protocolBytes.toString()).begin.inputHash);
  61 |   const pinnedPlan=forensic.events.find((e:any)=>e.stage==='owned-plan').value,pinnedSnapshot=forensic.events.find((e:any)=>e.stage==='getSnapshot').value.body.snapshot;expect(originalOwned).toEqual(pinnedPlan);const oracle=sourceOracle(pinnedPlan,pinnedSnapshot.calendar,payload,contextArtifact.expectedHash);expect(oracle.source.basisHash).toBe(pinnedSnapshot.consistency.basisHash);journal.expectedSource=oracle.source;save();const oldContext=forensic.events.find((e:any)=>e.stage==='forensic-verified'&&e.value.mode==='context').value;expect(oldContext.metaHashBefore).toBe(metaHash);
  62 |   const forecast=pinnedForecast();expect(forecast.sourceHashes).toEqual(oracle.source);journal.expectedForecast=forecast;const resumeStartedMs=Date.now();journal.resumeStartedMs=resumeStartedMs;save();
  63 |   job=await resumeToPublication({initial:job,advance:async(payload:any)=>{journal.advanceCalls++;journal.lastWriteStartedMs=Date.now();save();try{return await rawInvoke('advanceSponsorReportCapture',payload);}finally{journal.lastWriteReturnedMs=Date.now();save();}},status:async()=>checkedJob((await read('getSponsorReportCapture',{planId,jobId})).job),probe:async(current:any)=>{journal.finalJob=current;save();const observed=await probe();journal.finalProbe=observed;save();preservedArtifacts(observed,current,before);},onObserved:(value:any)=>record('continuation',value)});
  64 |   journal.finalJob=job;journal.publicationObserved=true;publishedProbe=structuredClone(journal.finalProbe);save();
  65 |   const summary=(await read('getSponsorReport',{planId,reportId})).report;journal.report=summary;save();const graded=verifyPublished(summary,{oracle,forecast,initialJob,resumeStartedMs});expect((await read('listSponsorReports',{planId})).entries.map((r:any)=>r.id)).toEqual([reportId]);
  66 |   const pages:any[]=[];for(let n=0;n<106;n++){const part=(await read('getSponsorReportPage',{planId,reportId,section:'timeline',page:n})).page;verifyReportPage(part,summary,n,graded.rows);pages.push(part);}journal.pages=pages;journal.all5300ReportFieldsVerified=true;save();
  67 |   const pf=await openPlan(page,name),work=await planning(pf);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();const report=work.locator('[data-testid="sponsor-reports"]'),pendingReport=actualResponse(page,'getSponsorReport',planId);await report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button').filter({hasText:'Every existing performance row'}).click();expect((await pendingReport).report).toEqual(summary);
  68 |   const forecastText='P50 2052-02-26 · P80 2052-03-04 · P90 2052-03-14';await expect(report.locator('[data-testid="report-forecast"]')).toContainText(forecastText);await settledScreenshot(report.locator('[data-testid="report-forecast"]'),{path:info.outputPath('retained5300-forecast.png')});
  69 |   record('download-before-wait');const pendingDownload=page.waitForEvent('download',{timeout:600000});pendingDownload.catch(()=>{});record('download-before-click');await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();record('download-click');const download=await pendingDownload;record('download-event',{filename:download.suggestedFilename()});expect(download.suggestedFilename()).toBe(`sponsor-report-${reportId}.html`);const htmlFile=info.outputPath('retained5300-actual-report.html');record('download-before-save');await download.saveAs(htmlFile);expect(await download.failure()).toBeNull();const htmlBytes=fs.readFileSync(htmlFile);record('download-saved',{sha256:sha(htmlBytes),bytes:htmlBytes.length});expect(htmlBytes.toString()).toBe(expectedHtml(summary,pages));
  70 |   record('local-document-before-open');const doc=await page.context().newPage(),external:string[]=[];let docError:any;doc.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  71 |   try{record('local-document-before-navigation');await doc.goto(pathToFileURL(htmlFile).href);await expect(doc.locator('script,iframe,img,link')).toHaveCount(0);await expect(doc.locator('tr[data-issue-key]')).toHaveCount(5300);await expect(doc.locator('tr[data-target-key],tr[data-capacity-key]')).toHaveCount(0);expect(external).toEqual([]);
  72 |    const rendered=await doc.locator('tr[data-issue-key]').evaluateAll((rows:any[])=>rows.map(r=>({key:r.getAttribute('data-issue-key'),cells:[...r.querySelectorAll('td')].map((c:any)=>c.textContent.trim()),bars:r.querySelectorAll('.track .bar').length})));expect(rendered).toEqual(graded.rows.map((r:any)=>({key:r.key,cells:[r.key,r.summary,r.startDate??'—',r.dueDate??'—',String(r.duration??'—'),r.statusCategory,''],bars:1})));journal.all5300HtmlFieldsVerified=true;save();await expect(doc.locator('body')).toContainText(forecastText);await expect(doc.locator('body')).toContainText('seed 42, 40 simulated finishes');await expect(doc.locator('.report-provenance')).toContainText(reportId);await expect(doc.locator('.report-provenance')).toContainText(summary.hash);
  73 |    for(const key of ['LZPP-1','LZPP-5300','LZPP-6']){const row=doc.locator(`tr[data-issue-key="${key}"]`);await row.scrollIntoViewIfNeeded();await settledScreenshot(doc,{subject:row,path:info.outputPath(`retained5300-${key}.png`)});}
  74 |   }catch(error){docError=error;throw error;}finally{try{await doc.close();record('local-document-closed');}catch(error){throw new AggregateError([...(docError?[docError]:[]),error],'Full report body/document close errors');}}
  75 |   await page.goto('about:blank');const againFrame=await openPlan(page,name),againWork=await planning(againFrame);await againWork.getByRole('button',{name:'Sponsor reports',exact:true}).click();const againReport=againWork.locator('[data-testid="sponsor-reports"]'),againRead=actualResponse(page,'getSponsorReport',planId);await againReport.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button').filter({hasText:'Every existing performance row'}).click();expect((await againRead).report).toEqual(summary);await page.goto('about:blank');
  76 |   for(let n=0;n<106;n++)expect((await read('getSponsorReportPage',{planId,reportId,section:'timeline',page:n})).page).toEqual(pages[n]);expect((await read('getSponsorReport',{planId,reportId})).report).toEqual(summary);journal.reopenedAllPagesImmutable=true;await snapshot();await baseline();expect(await owned()).toEqual(originalOwned);expect(await read('getCapacitySettings')).toEqual(expectedPrefs);journal.reviewRequired=true;journal.completed=true;record('stopped-for-root-report-inspection',{state:job.state,checkpoint:job.checkpoint,cleanupDone:job.cleanupDone});
  77 | 
  78 |  }catch(error){bodyError=error;record('body-error',String(error));throw error;}
  79 |  finally{const errors:any[]=[];for(const[label,audit]of[
  80 |   ['no-unexpected-ui-writes',async()=>expect(forbiddenUi).toEqual([])],['stop-owned-ui',async()=>{if(!page.isClosed())await page.goto('about:blank');}],['retained-job',async()=>{if(ready){const final=checkedJob((await read('getSponsorReportCapture',{planId,jobId})).job);journal.finalJob=final;journal.publicationObserved=final.state==='complete';save();const physical=await probe();journal.finalProbe=physical;save();verifyCaptureProbe(physical,{planId,jobId,...final});if(admittedProbe)preservedArtifacts(physical,final,admittedProbe);if(publishedProbe)expect(physical).toEqual(publishedProbe);}}],['pristine-snapshot',async()=>{if(ready)await snapshot();}],['shared-issue',async()=>{for(let n=0;n<2;n++)await sharedIssue();}],['original-source',async()=>{if(originalSource)expect(await source()).toEqual(originalSource);}],['registry',async()=>await registry(planDeleted?originals:ownedRegistry)],
  81 |   ['source-plan',async()=>{if(originalOwned&&!planDeleted)expect(await owned()).toEqual(originalOwned);}],['preferences',async()=>{if(ready)for(let n=0;n<2;n++)expect(await read('getCapacitySettings')).toEqual(expectedPrefs);}],['original-drafts',async()=>{if(ready)for(const id of originals)await drafts(id);}],['owned-baseline',async()=>{if(ready&&!planDeleted){await drafts(planId);await baseline();}}]
  82 |  ]as const){try{await audit();}catch(error){errors.push(error);record('independent-audit-error',{label,error:String(error)});}}journal.sourceAndPreferencesPreserved=ready&&errors.length===0;if(errors.length)journal.completed=false;page.off('request',capture);await page.unroute('**/*',blockUiWrites);save();if(errors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...errors],'Retained diagnostic/recovery and independent audit errors');}
  83 | });
  84 | 
```