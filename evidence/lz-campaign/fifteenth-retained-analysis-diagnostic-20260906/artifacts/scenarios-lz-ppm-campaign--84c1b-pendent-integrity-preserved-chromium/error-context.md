# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-recover-fifteenth-large.spec.ts >> fifteenth retained large advance: exact owned state and independent integrity preserved
- Location: scenarios/lz-ppm/campaign-recover-fifteenth-large.spec.ts:14:50

# Error details

```
Error: Diagnostic advance outcome unknown; exact original response retained
```

# Test source

```ts
  1  | // Two explicitly selected phases. Advance always stops for review; cleanup never deletes a published report.
  2  | import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
  3  | import {test,expect} from '../../fixtures/forge';import {getTestState} from '../../testhook/client';import {getHarnessLaunchReceipt} from '../../forge/browser';
  4  | import {openPlans,scheduleFields,LZPT_PLAN} from './forecast-fixture';import {actualResponse,callEnvelope} from './campaign-ui';import {replayHeaders} from './replay-headers.mjs';
  5  | import {observeCaptureProbe,verifyCaptureProbe,cleanReportCapture} from './report-capture-cleanup.mjs';import {retained,checkedJob,classifyAdvance,admitCleanup} from './fifteenth-report-recovery-contract.mjs';import {settledScreenshot} from './settled-screenshot.mjs';
  6  | const {planId,jobId,reportId,requestId,snapshotId,name}=retained;
  7  | const originals=[LZPT_PLAN,'plan-mta3aw3t-6dyijd','plan-mtbrlh8n-7ghw8u'].sort(),ownedRegistry=[...originals,planId].sort();
  8  | const archived=path.resolve('evidence/lz-campaign/fifteenth-staged-report-live-20260906/large-history-report-live/attempt-001/tests-artifacts/scenarios-lz-ppm-journey-c-2f98e-without-mutating-the-source-chromium');
  9  | const sha=(value:any)=>createHash('sha256').update(value).digest('hex');
  10 | const canonical=(x:any):any=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
  11 | const fields=(rows:any[])=>rows.map(i=>({key:i.key,id:i.id,summary:i.summary,statusCategory:i.statusCategory??'unknown',startDate:i.startDate??null,dueDate:i.dueDate??null,duration:i.duration??null,buffer:i.buffer||'No',parentKey:i.parentKey??null,predecessors:[...(i.predecessors||[])].sort(),successors:[...(i.successors||[])].sort()})).sort((a,b)=>a.key.localeCompare(b.key));
  12 | const expectedPrefs={success:true,version:59,settings:{selectedPlanIds:[],profiles:{},issueChoices:{}}};
  13 | test.describe.configure({retries:0,timeout:900000});
  14 | for(const phase of ['advance','cleanup']as const)test(`fifteenth retained large ${phase}: exact owned state and independent integrity preserved`,async({page},info)=>{
  15 |  expect(process.env.LZ_FIFTEENTH_RECOVERY_PHASE).toBe(phase);
  16 |  const originalBytes=fs.readFileSync(path.join(archived,'large-history-journal.json'));expect(sha(originalBytes)).toBe('7602dedf71dca9a2ffe4d561448c4b7aa03d315dc88ff0a6128f74ca0c9d9325');const original=JSON.parse(originalBytes.toString());
  17 |  const rawBytes=fs.readFileSync(path.join(archived,'large-capture-raw-expected.json'));expect(sha(rawBytes)).toBe('30117abfe6ad551e6c5a8d8ceb4d8622e43e51258af8659026b8d25ca1641709');const expectedRows=JSON.parse(rawBytes.toString());expect(expectedRows).toHaveLength(5300);
  18 |  const protocolBytes=fs.readFileSync(path.join(archived,'report-capture-protocol.json'));expect(sha(protocolBytes)).toBe('6622266633e7b8728f9596f31a7e4a6598a5bc2a121cb88c8a865b277104796a');const initialJob=JSON.parse(protocolBytes.toString()).job;checkedJob(initialJob);expect(initialJob).toMatchObject({checkpoint:56,state:'active',cleanupDone:false});
  19 |  const receipt=getHarnessLaunchReceipt(page.context());if(!receipt||receipt.mode!=='portable-chrome152')throw new Error('Known portable Chrome152 receipt required');expect(receipt).toMatchObject({mode:'portable-chrome152',browserVersion:'152.0.7977.76',principalSha256:'b4cb5211a5e4d44c9f3a6bc909588c2fe62162358d4b0c04da52aa6977433769',executableSha256:'755178ee89130a6f1c94cc4ecb2289fe74240db3e7efe9ec69a6cfcd4b93a6ee',frameworkSha256:'bfea9981cc61dfa72d847c920f274e4e96e362954f451198d8ee1650cbefb2e6'});expect(receipt!.uiVersion).toBe(process.env.LZ_EXPECTED_UI_VERSION);
  20 |  const journal:any={phase,retained,receipt,events:[],probes:[],advanceCalls:0,publicationObserved:false,sourceAndPreferencesPreserved:false,completed:false};fs.mkdirSync(info.outputDir,{recursive:true});const save=()=>fs.writeFileSync(info.outputPath(`fifteenth-${phase}.json`),JSON.stringify(journal,null,2));const record=(stage:string,value:any)=>{journal.events.push({stage,time:new Date().toISOString(),value});save();};save();
  21 |  let wire:any,ready=false,bodyError:any,originalSource:any,originalOwned:any,planDeleted=false;
  22 |  const capture=(req:any)=>{const envelope=callEnvelope(req);if(envelope?.variables?.input?.payload?.call?.functionKey==='getCapacitySettings')wire={url:req.url(),data:envelope,headers:req.allHeaders()};};page.on('request',capture);
  23 |  const allowed=new Set(['getCapacitySettings','getDraft','getActiveDrafts','getLockStatus','getSponsorReportCapture','getSnapshot','listSponsorReports','getSponsorReport','getSponsorReportPage',...(phase==='advance'?['advanceSponsorReportCapture']:['cancelSponsorReportCapture','deletePlan'])]);
  24 |  const rawInvoke=async(key:string,payload:any={})=>{
  25 |   expect(allowed.has(key)).toBe(true);expect(wire).toBeTruthy();if(key==='advanceSponsorReportCapture'){expect(phase).toBe('advance');expect(journal.advanceCalls).toBe(0);expect(payload).toEqual({planId,jobId,expectedCheckpoint:56});journal.advanceCalls++;}
  26 |   const mutating=['advanceSponsorReportCapture','cancelSponsorReportCapture','deletePlan'].includes(key);if(mutating){journal.lastWriteStartedMs=Date.now();record('write-intent',{key,payload});}
  27 |   const envelope=structuredClone(wire.data);envelope.variables.input.payload.call={functionKey:key,payload};
  28 |   try{const response=await page.request.post(wire.url,{headers:replayHeaders(await wire.headers),data:JSON.stringify(envelope),maxRetries:0,timeout:60000});const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=null;}
  29 |    const extension=data?.data?.invokeExtension;const observed={httpStatus:response.status(),outerSuccess:extension?.success??null,body:extension?.response?.body??null,errors:extension?.errors??data?.errors??null,...(!data?{nonJson:{bytes:Buffer.byteLength(text),sha256:sha(text)}}:{}),traceId:response.headers()['atl-traceid']??null};if(mutating)journal.lastWriteReturnedMs=Date.now();record(key,observed);return observed;
  30 |   }catch(error){if(mutating)journal.lastWriteReturnedMs=Date.now();record('transport-error',{key,message:String(error)});throw error;}
  31 |  };
  32 |  const invoke=async(key:string,payload:any={})=>{const result=await rawInvoke(key,payload);expect(result.httpStatus).toBe(200);expect(result.outerSuccess).toBe(true);expect(result.body).toBeTruthy();return result.body;};
  33 |  const read=async(key:string,payload:any={})=>{const value=await invoke(key,payload);expect(value.success,value.error).toBe(true);return value;};
  34 |  const registry=async(ids:string[])=>{const value=await getTestState('lz-ppm',{what:'plans'});record('registry',value.plans);expect(value.plans.map((p:any)=>p.id).sort()).toEqual(ids);};
  35 |  const source=async()=>{const s=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});const basis={issues:scheduleFields(s.issues),sources:s.meta.sources,calendarKey:s.meta.calendarKey,holidayYears:s.meta.holidayYears,milestones:s.meta.milestones,protectionEnabled:s.meta.protectionEnabled};expect(s.issues).toHaveLength(45);expect(sha(JSON.stringify(basis))).toBe('2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104');return s;};
  36 |  const owned=async()=>{const value=await getTestState('lz-ppm',{what:'plan',planId});record('owned-plan',value);expect(value.meta).toMatchObject({id:planId,name,createdBy:'harness',calendarKey:'standard',sources:[{id:'src-0',type:'jql',label:'harness',query:'project = LZPP ORDER BY key ASC',boardId:null,projectKey:null}]});expect(value.meta.mode).toBeUndefined();expect(fields(value.issues)).toEqual(expectedRows);return value;};
  37 |  const snapshot=async()=>{const value=(await read('getSnapshot',{planId,snapshotId})).snapshot;expect(value).toMatchObject({id:snapshotId,hash:original.snapshot.hash,issueCount:5300,workingChangeCount:0});expect(value.mode).toBeUndefined();expect(value.calendar.workingDays).toEqual([1,2,3,4,5]);expect(value.calendar.holidays).toEqual([]);expect(fields(value.issues)).toEqual(expectedRows);return value;};
  38 |  const drafts=async(id:string)=>{expect(await read('getDraft',{planId:id})).toEqual({success:true,draft:null});expect(await read('getActiveDrafts',{planId:id})).toEqual({success:true,drafts:{}});};
  39 |  const probe=async()=>observeCaptureProbe(()=>getTestState('lz-ppm',{what:'reportCaptureState',planId,jobId}),(v:any)=>{journal.probes.push(v);save();});
  40 |  const readPublication=async(job:any)=>{if(job.state!=='complete')return; journal.publicationObserved=true;save();const report=(await read('getSponsorReport',{planId,reportId})).report;expect(report.id).toBe(reportId);expect(report.counts.timeline).toBe(5300);journal.publishedReport=report;save();const all:any[]=[];for(const[section,count]of Object.entries(report.pages))for(let n=0;n<Number(count);n++){const p=(await read('getSponsorReportPage',{planId,reportId,section,page:n})).page;expect(p.rows).toHaveLength(report.document[section].sizes[n]);expect(sha(JSON.stringify(canonical(p.rows)))).toBe(report.document[section].hashes[n]);all.push(p);}journal.publishedPages=all;record('publication-retained-for-export-review',{reportId});};
  41 |  try{
  42 |   originalSource=await source();record('original-source',originalSource);await registry(ownedRegistry);originalOwned=await owned();
  43 |   const frame=await openPlans(page),pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();expect(await pending).toEqual(expectedPrefs);ready=true;expect(await read('getCapacitySettings')).toEqual(expectedPrefs);await drafts(LZPT_PLAN);await drafts(planId);expect(await read('getLockStatus',{planId})).toMatchObject({locked:false});const originalSnapshot=await snapshot();record('snapshot-hash-and-full-fields',{id:snapshotId,hash:originalSnapshot.hash,count:5300});
  44 |   let job=checkedJob((await read('getSponsorReportCapture',{planId,jobId})).job);const before=await probe();verifyCaptureProbe(before,{planId,jobId,...job});
  45 |   if(phase==='advance'){
  46 |    expect(job).toEqual(initialJob);expect(before).toEqual(original.reportRecovery.probes[0]);expect(before.privateArtifacts).toHaveLength(107);expect(before.publicArtifacts).toEqual([]);expect((await read('listSponsorReports',{planId})).entries).toEqual([]);
  47 |    await page.goto('about:blank');record('single-advance-before-dispatch',{utc:new Date().toISOString(),checkpoint:56});
  48 |    let outcome:any;try{const response=await rawInvoke('advanceSponsorReportCapture',{planId,jobId,expectedCheckpoint:56});journal.advanceResponse=response;outcome=classifyAdvance(response);journal.outcome=outcome;save();}catch(error){journal.outcome='unknown';journal.originalAdvanceError=String(error);save();bodyError=error;}
  49 |    // A status read is observation, never another write after an unknown result.
  50 |    for(let n=0;n<2;n++){job=checkedJob((await read('getSponsorReportCapture',{planId,jobId})).job);record('post-advance-status',job);}
  51 |    journal.finalJob=job;journal.finalProbe=await probe();verifyCaptureProbe(journal.finalProbe,{planId,jobId,...job});await readPublication(job);await snapshot();expect(await owned()).toEqual(originalOwned);journal.reviewRequired=true;record('stopped-for-root-review',{outcome:journal.outcome,state:job.state,checkpoint:job.checkpoint});
> 52 |    if(bodyError)throw bodyError;if(['unknown','refused','failed'].includes(journal.outcome))throw new Error(`Diagnostic advance outcome ${journal.outcome}; exact original response retained`);journal.completed=true;save();
     |                                                                                                   ^ Error: Diagnostic advance outcome unknown; exact original response retained
  53 |   }else{
  54 |    const inputPath=process.env.LZ_FIFTEENTH_ADVANCE_JOURNAL;expect(inputPath).toBeTruthy();const bytes=fs.readFileSync(path.resolve(inputPath!)),diagnostic=JSON.parse(bytes.toString());const admitted=admitCleanup(diagnostic,sha(bytes),process.env.LZ_FIFTEENTH_ADVANCE_SHA,Date.now());expect(job).toEqual(admitted);expect(before).toEqual(diagnostic.finalProbe);journal.admittedDiagnostic={path:path.resolve(inputPath!),sha256:sha(bytes)};save();
  55 |    expect(before.publicArtifacts).toEqual([]);expect((await read('listSponsorReports',{planId})).entries).toEqual([]);await page.goto('about:blank');
  56 |    const cleaned:any=await cleanReportCapture({planId,jobId,requestId,invoke,probe:async()=>probe(),onState:(v:any)=>record('acknowledged-cleanup',v)});expect(cleaned.cleaned).toBe(true);expect(cleaned.job.state).not.toBe('complete');verifyCaptureProbe(cleaned.probes.at(-1),{planId,jobId,...cleaned.job},before);journal.cleanedJob=cleaned.job;save();
  57 |    for(let n=0;n<2;n++){expect((await read('listSponsorReports',{planId})).entries).toEqual([]);expect(await invoke('getSponsorReport',{planId,reportId})).toEqual({success:false,error:'This sponsor report was deleted or is unavailable'});}await snapshot();expect(await owned()).toEqual(originalOwned);await drafts(planId);expect(await read('getCapacitySettings')).toEqual(expectedPrefs);
  58 |    const deleted=await read('deletePlan',{planId});expect(deleted.ghostRowRemoved).not.toBe(true);journal.planDeleteAck=deleted;planDeleted=true;save();for(let n=0;n<2;n++){const absent=await getTestState('lz-ppm',{what:'plan',planId});record('plan-absence',absent);expect(absent.meta==null).toBe(true);expect(absent.issues).toEqual([]);await registry(originals);}const final=await openPlans(page);await expect(final.getByRole('button',{name:/Open plan/})).toHaveCount(3);await settledScreenshot(page,{subject:final.locator('.lz-card',{hasText:'LZPT Scenarios'}),path:info.outputPath('fifteenth-original-three-restored.png'),fullPage:true});journal.completed=true;save();
  59 |   }
  60 |  }catch(error){bodyError=error;record('body-error',String(error));throw error;}
  61 |  finally{const errors:any[]=[];for(const[label,audit]of[
  62 |   ['original-source',async()=>{if(originalSource)expect(await source()).toEqual(originalSource);}],['registry',async()=>await registry(planDeleted?originals:ownedRegistry)],
  63 |   ['source-plan',async()=>{if(originalOwned&&!planDeleted)expect(await owned()).toEqual(originalOwned);}],['preferences',async()=>{if(ready)for(let n=0;n<2;n++)expect(await read('getCapacitySettings')).toEqual(expectedPrefs);}],['original-drafts',async()=>{if(ready)await drafts(LZPT_PLAN);}]
  64 |  ]as const){try{await audit();}catch(error){errors.push(error);record('independent-audit-error',{label,error:String(error)});}}journal.sourceAndPreferencesPreserved=ready&&errors.length===0;if(errors.length)journal.completed=false;page.off('request',capture);save();if(errors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...errors],'Retained diagnostic/recovery and independent audit errors');}
  65 | });
  66 | 
```