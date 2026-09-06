# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-seventeenth-forensic.spec.ts >> seventeenth forensic readonly: context-return and actual analyze preserve exact retained state
- Location: scenarios/lz-ppm/campaign-seventeenth-forensic.spec.ts:17:1

# Error details

```
AggregateError: Read-only forensic modes failed; exact raw results retained
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 424
```

# Test source

```ts
  1  | // Two fixed read-only forensic modes; no report advance, lock acquisition, cleanup or publication.
  2  | import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
  3  | import {test,expect} from '../../fixtures/forge';import {getTestState} from '../../testhook/client';import {getHarnessLaunchReceipt} from '../../forge/browser';
  4  | import {openPlans,scheduleFields,LZPT_PLAN} from './forecast-fixture';import {actualResponse,callEnvelope} from './campaign-ui';import {replayHeaders} from './replay-headers.mjs';
  5  | import {observeCaptureProbe,verifyCaptureProbe} from './report-capture-cleanup.mjs';import {retained,checkedJob} from './seventeenth-report-recovery-contract.mjs';
  6  | import {admitForensic,verifyForensicResult} from './seventeenth-forensic-contract.mjs';
  7  | import {createForensicReader} from './seventeenth-forensic-transport.mjs';
  8  | import {get,BASE} from '../../data/jira.mjs';import {admitPackedFixture} from './report-packed-upgrade-contract.mjs';
  9  | const {planId,jobId,reportId,requestId,snapshotId,name}=retained;
  10 | const originals=[LZPT_PLAN,'plan-mta3aw3t-6dyijd','plan-mtbrlh8n-7ghw8u'].sort(),ownedRegistry=[...originals,planId].sort();
  11 | const archived=path.resolve('evidence/lz-campaign/seventeenth-packed-report-live-20260906/large-history-report-live/attempt-001/tests-artifacts/scenarios-lz-ppm-journey-c-2f98e-without-mutating-the-source-chromium');
  12 | const sha=(value:any)=>createHash('sha256').update(value).digest('hex');
  13 | const canonical=(x:any):any=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
  14 | const fields=(rows:any[])=>rows.map(i=>({key:i.key,id:i.id,summary:i.summary,statusCategory:i.statusCategory??'unknown',startDate:i.startDate??null,dueDate:i.dueDate??null,duration:i.duration??null,buffer:i.buffer||'No',parentKey:i.parentKey??null,predecessors:[...(i.predecessors||[])].sort(),successors:[...(i.successors||[])].sort()})).sort((a,b)=>a.key.localeCompare(b.key));
  15 | const expectedPrefs={success:true,version:65,settings:{selectedPlanIds:[],profiles:{},issueChoices:{}}};
  16 | test.describe.configure({retries:0,timeout:900000});
  17 | test('seventeenth forensic readonly: context-return and actual analyze preserve exact retained state',async({page},info)=>{
  18 |  expect(process.env.LZ_SEVENTEENTH_FORENSIC_PHASE).toBe('readonly');
  19 |  expect(BASE).toBe('https://wolfaenpak.atlassian.net');const fixtureBytes=fs.readFileSync(path.resolve('tests/report-packed-upgrade/fixture-read.json'));expect(sha(fixtureBytes)).toBe('bac0f90bddbe0d6b368564c929e3931044a590113a2250dec04a3e3db6fd5d1a');const fixture=JSON.parse(fixtureBytes.toString());expect(fixture.first).toEqual(fixture.second);
  20 |  const previousPath=path.resolve('evidence/lz-campaign/seventeenth-retained-analysis-diagnostic-20260906/artifacts/scenarios-lz-ppm-campaign--8294a-pendent-integrity-preserved-chromium/seventeenth-advance.json');const previousBytes=fs.readFileSync(previousPath),previous=JSON.parse(previousBytes.toString());const latestPath=path.resolve('evidence/lz-campaign/seventeenth-context-first-diagnostic-20260906/artifacts/scenarios-lz-ppm-campaign--bc021-pendent-integrity-preserved-chromium/seventeenth-context-first-advance.json');const latestBytes=fs.readFileSync(latestPath),latest=JSON.parse(latestBytes.toString());const preludePath=path.resolve('evidence/lz-campaign/seventeenth-prelude-diagnostic-20260906/artifacts/scenarios-lz-ppm-campaign--0a513-pendent-integrity-preserved-chromium/seventeenth-prelude-advance.json');const preludeBytes=fs.readFileSync(preludePath),prelude=JSON.parse(preludeBytes.toString());const previousAdmitted=admitForensic(prelude,sha(preludeBytes),latest,sha(latestBytes),previous,sha(previousBytes),Date.now());
  21 |  const originalBytes=fs.readFileSync(path.join(archived,'large-history-journal.json'));expect(sha(originalBytes)).toBe('3b47f1e7f32779ebf2ad9671d09aaded34e6052e2236e875e43166bcbb296617');const original=JSON.parse(originalBytes.toString());
  22 |  const rawBytes=fs.readFileSync(path.join(archived,'large-capture-raw-expected.json'));expect(sha(rawBytes)).toBe('30117abfe6ad551e6c5a8d8ceb4d8622e43e51258af8659026b8d25ca1641709');const expectedRows=JSON.parse(rawBytes.toString());expect(expectedRows).toHaveLength(5300);
  23 |  const protocolBytes=fs.readFileSync(path.join(archived,'report-capture-protocol.json'));expect(sha(protocolBytes)).toBe('556e97bad26581731a88d2098c0f178e00808bfcb03ee4aee5099945d8cd7211');const initialJob=JSON.parse(protocolBytes.toString()).job;checkedJob(initialJob);expect(initialJob).toMatchObject({checkpoint:78,state:'active',cleanupDone:false});
  24 |  const receipt=getHarnessLaunchReceipt(page.context());if(!receipt||receipt.mode!=='portable-chrome152')throw new Error('Known portable Chrome152 receipt required');expect(receipt).toMatchObject({mode:'portable-chrome152',browserVersion:'152.0.7977.76',principalSha256:'b4cb5211a5e4d44c9f3a6bc909588c2fe62162358d4b0c04da52aa6977433769',executableSha256:'755178ee89130a6f1c94cc4ecb2289fe74240db3e7efe9ec69a6cfcd4b93a6ee',frameworkSha256:'bfea9981cc61dfa72d847c920f274e4e96e362954f451198d8ee1650cbefb2e6'});expect(receipt!.uiVersion).toBe(process.env.LZ_EXPECTED_UI_VERSION);
  25 |  const journal:any={phase:"readonly",retained,receipt,preludeDiagnostic:{path:preludePath,sha256:sha(preludeBytes)},previousDiagnostic:{path:latestPath,sha256:sha(latestBytes)},olderDiagnostic:{path:previousPath,sha256:sha(previousBytes)},events:[],probes:[],advanceCalls:0,publicationObserved:false,sourceAndPreferencesPreserved:false,completed:false};fs.mkdirSync(info.outputDir,{recursive:true});const save=()=>fs.writeFileSync(info.outputPath('seventeenth-forensic.json'),JSON.stringify(journal,null,2));const record=(stage:string,value:any)=>{journal.events.push({stage,time:new Date().toISOString(),value});save();};save();
  26 |  let wire:any,ready=false,bodyError:any,originalSource:any,originalOwned:any,planDeleted=false;
  27 |  const capture=(req:any)=>{const envelope=callEnvelope(req);if(envelope?.variables?.input?.payload?.call?.functionKey==='getCapacitySettings')wire={url:req.url(),data:envelope,headers:req.allHeaders()};};page.on('request',capture);
  28 |  const allowed=new Set(['getCapacitySettings','getDraft','getActiveDrafts','getLockStatus','getSponsorReportCapture','getSnapshot','getBaseline','listSponsorReports','getSponsorReport','getSponsorReportPage']);
  29 |  const rawInvoke=async(key:string,payload:any={})=>{
  30 |   expect(allowed.has(key)).toBe(true);expect(wire).toBeTruthy();
  31 |   const envelope=structuredClone(wire.data);envelope.variables.input.payload.call={functionKey:key,payload};
  32 |   try{const response=await page.request.post(wire.url,{headers:replayHeaders(await wire.headers),data:JSON.stringify(envelope),maxRetries:0,timeout:60000});const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=null;}
  33 |    const extension=data?.data?.invokeExtension;const observed={httpStatus:response.status(),outerSuccess:extension?.success??null,body:extension?.response?.body??null,errors:extension?.errors??data?.errors??null,...(!data?{nonJson:{bytes:Buffer.byteLength(text),sha256:sha(text)}}:{}),traceId:response.headers()['atl-traceid']??null};record(key,observed);return observed;
  34 |   }catch(error){record('transport-error',{key,message:String(error)});throw error;}
  35 |  };
  36 |  const invoke=async(key:string,payload:any={})=>{const result=await rawInvoke(key,payload);expect(result.httpStatus).toBe(200);expect(result.outerSuccess).toBe(true);expect(result.body).toBeTruthy();return result.body;};
  37 |  const read=async(key:string,payload:any={})=>{const value=await invoke(key,payload);expect(value.success,value.error).toBe(true);return value;};
  38 |  const registry=async(ids:string[])=>{const value=await getTestState('lz-ppm',{what:'plans'});record('registry',value.plans);expect(value.plans.map((p:any)=>p.id).sort()).toEqual(ids);};
  39 |  const source=async()=>{const s=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});const basis={issues:scheduleFields(s.issues),sources:s.meta.sources,calendarKey:s.meta.calendarKey,holidayYears:s.meta.holidayYears,milestones:s.meta.milestones,protectionEnabled:s.meta.protectionEnabled};expect(s.issues).toHaveLength(45);expect(sha(JSON.stringify(basis))).toBe('2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104');return s;};
  40 |  const owned=async()=>{const value=await getTestState('lz-ppm',{what:'plan',planId});record('owned-plan',value);expect(value.meta).toMatchObject({id:planId,name,createdBy:'harness',calendarKey:'standard',sources:[{id:'src-0',type:'jql',label:'harness',query:'project = LZPP ORDER BY key ASC',boardId:null,projectKey:null}]});expect(value.meta.mode).toBeUndefined();expect(fields(value.issues)).toEqual(expectedRows);return value;};
  41 |  const snapshot=async()=>{const value=(await read('getSnapshot',{planId,snapshotId})).snapshot;expect(value).toMatchObject({id:snapshotId,hash:original.snapshot.hash,issueCount:5300,workingChangeCount:0});expect(value.mode).toBeUndefined();expect(value.calendar.workingDays).toEqual([1,2,3,4,5]);expect(value.calendar.holidays).toEqual([]);expect(fields(value.issues)).toEqual(expectedRows);return value;};
  42 |  const baseline=async()=>{expect(await invoke('getBaseline',{planId})).toEqual({baseline:null});};
  43 |  const drafts=async(id:string)=>{expect(await read('getDraft',{planId:id})).toEqual({success:true,draft:null});expect(await read('getActiveDrafts',{planId:id})).toEqual({success:true,drafts:{}});};
  44 |  const probe=async()=>observeCaptureProbe(()=>getTestState('lz-ppm',{what:'reportCaptureState',planId,jobId}),(v:any)=>{journal.probes.push(v);save();});
  45 |  const sharedIssue=async()=>{const value=await get(`/rest/api/3/issue/WFH-2820?fields=${fixture.fields}`);record('shared-issue-readonly',value);admitPackedFixture(value,fixture.first);return value;};
  46 | 
  47 |  try{
  48 |   expect((await get('/rest/api/3/myself')).accountId).toBe('712020:937bc860-eec2-4294-a65d-8e0fe7c45086');expect(await sharedIssue()).toEqual(await sharedIssue());
  49 |   originalSource=await source();record('original-source',originalSource);await registry(ownedRegistry);originalOwned=await owned();
  50 |   const frame=await openPlans(page),pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();expect(await pending).toEqual(expectedPrefs);ready=true;expect(await read('getCapacitySettings')).toEqual(expectedPrefs);for(const id of originals)await drafts(id);await drafts(planId);await baseline();expect(await read('getLockStatus',{planId})).toMatchObject({locked:false});const originalSnapshot=await snapshot();record('snapshot-hash-and-full-fields',{id:snapshotId,hash:originalSnapshot.hash,count:5300});
  51 |   let job=checkedJob((await read('getSponsorReportCapture',{planId,jobId})).job);const before=await probe();verifyCaptureProbe(before,{planId,jobId,...job});
  52 |   expect(job).toEqual(previousAdmitted.job);expect(before).toEqual(previousAdmitted.probe);expect(job).toEqual(initialJob);expect(before).toEqual(original.reportRecovery.probes[0]);expect(before.privateArtifacts).toHaveLength(134);expect(before.publicArtifacts).toEqual([]);expect((await read('listSponsorReports',{planId})).entries).toEqual([]);
  53 |   await page.goto('about:blank');
  54 |   const contextKeyHash=sha(JSON.stringify(`p:${planId}:report-jobs:data:${jobId}:source-context`));const contextArtifact=before.privateArtifacts.find((a:any)=>a.keyHash===contextKeyHash);expect(contextArtifact).toBeTruthy();expect(contextArtifact.present).toBe(true);const metaHash=sha(JSON.stringify(canonical(originalOwned.meta)));
  55 |   const forensicRead=createForensicReader({base:process.env.LZ_PPM_TESTHOOK_URL,secret:process.env.HARNESS_SECRET,onObserved:(v:any)=>record('forensic-transport',v)});const forensicErrors:any[]=[];let priorEntryHash:any;
  56 |   for(const mode of ['context','analyze']){
> 57 |    try{record('forensic-before-call',{mode});const observed:any=await forensicRead(mode);journal.forensicCalls??=[];journal.forensicCalls.push(observed);save();expect(observed.httpStatus).toBe(200);expect(observed.parseError).toBeUndefined();const result=verifyForensicResult(observed.body,{mode,planId,jobId,metaHash,contextHash:contextArtifact.expectedHash,previousEntryHash:priorEntryHash});priorEntryHash=result.entryHashBefore;record('forensic-verified',result);}
     |                                                                                                                                                                                             ^ Error: expect(received).toBe(expected) // Object.is equality
  58 |    catch(error){forensicErrors.push(error);record('forensic-mode-error',{mode,message:String(error)});}
  59 |    // Guard every fixed call before the next one. No unknown or changed state licenses another call.
  60 |    try{for(let n=0;n<2;n++){job=checkedJob((await read('getSponsorReportCapture',{planId,jobId})).job);expect(job).toEqual(initialJob);record('post-forensic-status',job);}
  61 |    journal.finalJob=job;journal.finalProbe=await probe();verifyCaptureProbe(journal.finalProbe,{planId,jobId,...job},before);expect(journal.finalProbe).toEqual(before);await snapshot();await baseline();expect(await owned()).toEqual(originalOwned);expect(await read('getCapacitySettings')).toEqual(expectedPrefs);save();}catch(error){throw new AggregateError([...forensicErrors,error],'Read-only forensic outcome and post-call integrity failure');}
  62 |   }
  63 |   expect(journal.advanceCalls).toBe(0);journal.reviewRequired=true;record('stopped-for-root-review',{forensicErrorCount:forensicErrors.length,state:job.state,checkpoint:job.checkpoint});if(forensicErrors.length)throw new AggregateError(forensicErrors,'Read-only forensic modes failed; exact raw results retained');journal.completed=true;save();
  64 | 
  65 |  }catch(error){bodyError=error;record('body-error',String(error));throw error;}
  66 |  finally{const errors:any[]=[];for(const[label,audit]of[
  67 |   ['shared-issue',async()=>{for(let n=0;n<2;n++)await sharedIssue();}],['original-source',async()=>{if(originalSource)expect(await source()).toEqual(originalSource);}],['registry',async()=>await registry(planDeleted?originals:ownedRegistry)],
  68 |   ['source-plan',async()=>{if(originalOwned&&!planDeleted)expect(await owned()).toEqual(originalOwned);}],['preferences',async()=>{if(ready)for(let n=0;n<2;n++)expect(await read('getCapacitySettings')).toEqual(expectedPrefs);}],['original-drafts',async()=>{if(ready)for(const id of originals)await drafts(id);}],['owned-baseline',async()=>{if(ready&&!planDeleted)await baseline();}]
  69 |  ]as const){try{await audit();}catch(error){errors.push(error);record('independent-audit-error',{label,error:String(error)});}}journal.sourceAndPreferencesPreserved=ready&&errors.length===0;if(errors.length)journal.completed=false;page.off('request',capture);save();if(errors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...errors],'Retained diagnostic/recovery and independent audit errors');}
  70 | });
  71 | 
```