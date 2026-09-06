import {privateRetentionMode} from './private-retention-mode.mjs';
import {proveDeletedPlanTwice} from './deleted-plan-absence.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test,expect} from '../../fixtures/forge';
import {getHarnessLaunchReceipt} from '../../forge/browser';
import {getTestState} from '../../testhook/client';
import {get,BASE} from '../../data/jira.mjs';
import {openPlans,scheduleFields,LZPT_PLAN} from './forecast-fixture';
import {table} from './normalization-owned-fixture';
import {planning} from './campaign-ui';
import {settledScreenshot} from './settled-screenshot.mjs';
import {admitPackedFixture} from './report-packed-upgrade-contract.mjs';
import {admitPrivatePhase,privateAccount,privateHash,verifyPrivateSnapshot,privateReportOracle,privateDeletedState,privateCleanupStep,finishPrivateWitness} from './private-report-witness-contract.mjs';
import {privateWitnessSession} from './private-report-witness-session';
const enabled=admitPrivatePhase(process.env.LZ_PRIVATE_REPORT_PHASE);
const retain=privateRetentionMode(process.env.LZ_PRIVATE_RETAIN_MODE);
const originals=[LZPT_PLAN,'plan-mta3aw3t-6dyijd','plan-mtbrlh8n-7ghw8u'].sort();
const sha=(value:any)=>createHash('sha256').update(value).digest('hex');
test.describe.configure({retries:0,timeout:900000});
test('private staged report owner: genuine fork, all report fields and immutable HTML, public cleanup, unchanged shared Jira',async({page},info)=>{
 test.skip(!enabled,'Standalone private owner witness requires explicit phase');
 expect(BASE).toBe('https://wolfaenpak.atlassian.net');
 const receipt=getHarnessLaunchReceipt(page.context());if(!receipt||receipt.mode!=='portable-chrome152')throw new Error('Portable Chrome receipt required');expect(receipt?.principalSha256).toBe(sha(privateAccount));expect(receipt?.uiVersion).toBe(process.env.LZ_EXPECTED_UI_VERSION);
 const settings=JSON.parse(process.env.LZ_PRIVATE_EXPECTED_SETTINGS||'null');expect(settings?.success).toBe(true);expect(Number.isSafeInteger(settings?.version)&&settings.version>0).toBe(true);expect(settings.settings).toEqual({selectedPlanIds:[],profiles:{},issueChoices:{}});
 const fixtureBytes=fs.readFileSync('tests/report-packed-upgrade/fixture-read.json');expect(sha(fixtureBytes)).toBe('bac0f90bddbe0d6b368564c929e3931044a590113a2250dec04a3e3db6fd5d1a');const fixture=JSON.parse(fixtureBytes.toString());expect(fixture.first).toEqual(fixture.second);
 expect(sha(fs.readFileSync('tests/seventeenth-forecast-resume/old-producer-frozen.mjs'))).toBe('5b2eec2cf8257fac1d03da9fa41a23b5a501994400c93914c5c82db8e1f6c307');
 // Request/response credentials are retained only in memory; explicit evidence is strictly sanitized.
 await page.context().tracing.stop();
 fs.mkdirSync(info.outputDir,{recursive:true});const marker=Date.now().toString(36),sourceName=`[harness-test] Private report source ${marker}`,privateName=`[harness-test] Private report model ${marker}`,captureName='Private report source snapshot',reportName='Private owner immutable report';
 const journal:any={schema:1,phase:'owner',...(retain?{retentionMode:'retain'}:{}),sourceName,privateName,receipt,settings,events:[],owned:{},completed:false,jiraWrites:0,physicalKvsVerified:false,secondPrincipalVerified:false};
 const persist=()=>fs.writeFileSync(info.outputPath('private-report-witness.json'),JSON.stringify(journal,null,2));
 const record=(stage:string,value:any)=>{journal.events.push({stage,atMs:Date.now(),value});persist();};persist();
 const session=privateWitnessSession(page,{record});let originalSource:any,source:any,snapshot:any,owner:any,summary:any,finalJob:any,bodyFailed=false,documentPage:any;
 const hook=async(query:any)=>{if(['createFixture','clearDrafts','deleteFixture'].includes(query.what)){session.checked();await session.drain();session.checked();}else if(!['plans','plan'].includes(query.what))throw new Error('Unknown private witness hook action');const result=await getTestState('lz-ppm',query);record('private-hook',{query,result});return result;};
 const read=async(key:string,payload:any={})=>{const result=await session.invoke(key,payload);expect(result.success).toBe(true);return result;};
 const principal=async()=>{const response=await page.request.get(`${BASE}/rest/api/3/myself`);expect(response.status()).toBe(200);const body=await response.json();expect(body.accountId).toBe(privateAccount);record('browser-principal',{accountId:body.accountId});};
 const issue=async()=>{const result=await get(`/rest/api/3/issue/WFH-2820?fields=${fixture.fields}`);admitPackedFixture(result,fixture.first);record('shared-issue-get-only',result);return result;};
 const registry=async(ids:string[])=>{const result=await hook({what:'plans'});expect(result.plans.map((p:any)=>p.id).sort()).toEqual([...ids].sort());};
 const standing=async()=>{const actual=await hook({what:'plan',planId:LZPT_PLAN});expect(actual.issues).toHaveLength(45);const basis={issues:scheduleFields(actual.issues),sources:actual.meta.sources,calendarKey:actual.meta.calendarKey,holidayYears:actual.meta.holidayYears,milestones:actual.meta.milestones,protectionEnabled:actual.meta.protectionEnabled};expect(sha(JSON.stringify(basis))).toBe('2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104');if(originalSource)expect(actual).toEqual(originalSource);return actual;};
 const drafts=async(planId:string)=>{expect(await read('getDraft',{planId})).toEqual({success:true,draft:null});expect(await read('getActiveDrafts',{planId})).toEqual({success:true,drafts:{}});};
 const sourceUnchanged=async()=>{expect(await hook({what:'plan',planId:source.meta.id})).toEqual(source);expect((await read('getSnapshot',{planId:source.meta.id,snapshotId:snapshot.id})).snapshot).toEqual(snapshot);};
 const privateUnchanged=async()=>{expect(await read('getPlan',{planId:owner.planId})).toEqual({success:true,plan:owner.plan});expect(await read('getSimulationModel',{planId:owner.planId})).toEqual(owner.modelRead);};
 const perform=async(key:string,planId:string,action:()=>Promise<any>)=>{session.checked();await session.drain();session.checked();const pending=session.wait(key,planId);try{session.checked();await action();const body=await pending.promise;expect(body.success).toBe(true);return body;}finally{pending.dispose();}};
 const openOwned=async(name:string)=>{await session.stop();return table(page,name);};
 try{
  await principal();await registry(originals);originalSource=await standing();expect(await issue()).toEqual(await issue());
  let frame=await openPlans(page);await perform('getCapacitySettings','',()=>frame.getByRole('button',{name:'Capacity',exact:true}).click());expect(await read('getCapacitySettings')).toEqual(settings);
  // Standing plans are read-only; exact registry/source and personal preferences are independently bound.
  for(const id of originals){expect((await session.invoke('getDraft',{planId:id})).draft).toBeNull();expect((await session.invoke('getActiveDrafts',{planId:id})).drafts).toEqual({});}
  record('source-create-intent',{name:sourceName,jql:'key = WFH-2820'});const created=await hook({what:'createFixture',name:sourceName,jql:'key = WFH-2820'});journal.owned.sourcePlanId=created.planId;persist();source=await hook({what:'plan',planId:created.planId});session.source(source,sourceName);journal.source=source;persist();await registry([...originals,source.meta.id]);
  frame=await openOwned(sourceName);let work=await planning(frame);const calendarBody=await read('getPlanCalendar',{planId:source.meta.id});const {success,...calendar}=calendarBody;
  await work.getByLabel('Capture name',{exact:true}).fill(captureName);const captured=await perform('getSnapshot',source.meta.id,()=>work.getByRole('button',{name:'Capture working plan',exact:true}).click());snapshot=captured.snapshot;verifyPrivateSnapshot(snapshot,source,calendar,captureName);journal.snapshot=snapshot;persist();await drafts(source.meta.id);
  await work.getByRole('button',{name:'Open as private simulation…',exact:true}).click();const fork=work.locator('[data-testid="simulation-fork"]');await fork.getByLabel('Simulation plan name',{exact:true}).fill(privateName);
  owner=await session.fork(async()=>{record('fork-intent',{planId:source.meta.id,snapshotId:snapshot.id,name:privateName});const ack=await perform('forkSimulationPlan',source.meta.id,()=>fork.getByRole('button',{name:'Create private simulation',exact:true}).click());journal.observedPrivatePlanId=ack.plan.id;journal.fork=ack;persist();return ack;},{source,snapshot,name:privateName},async(plan:any)=>({planRead:await read('getPlan',{planId:plan.id}),modelRead:await read('getSimulationModel',{planId:plan.id})}));
  journal.owner=owner;journal.owned.privatePlanId=owner.planId;persist();await registry([...originals,source.meta.id,owner.planId]);await drafts(owner.planId);await privateUnchanged();
  frame=session.frame();await expect(frame.locator('[data-testid="simulation-plan-banner"]')).toBeVisible();await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveCount(0);await expect(frame.getByRole('button',{name:'Re-index',exact:true})).toHaveCount(0);await expect(frame.getByRole('button',{name:/^Apply \d+ change/})).toHaveCount(0);
  work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();let report=work.locator('[data-testid="sponsor-reports"]');await report.getByLabel('Report name',{exact:true}).fill(reportName);
  await session.drain();session.checked();const protocol=session.capture(owner.planId,(state:any)=>{journal.protocol=state;persist();});const started=Date.now();session.checked();await report.getByRole('button',{name:'Capture sponsor report',exact:true}).click();const capturedReport:any=await protocol.wait((s:any)=>s.job?.state==='complete'&&s.job.cleanupDone&&s.report,600000);await session.drain();finalJob=capturedReport.job;summary=capturedReport.report;journal.captureWindow={startMs:started,endMs:Date.now()};journal.finalJob=finalJob;journal.report=summary;persist();
  await expect(report.locator('[data-testid="report-capture-progress"]')).toContainText('Report captured and verified.');
  for(const payload of [{planId:owner.planId,jobId:finalJob.id},{planId:owner.planId}])expect(await read('getSponsorReportCapture',payload)).toEqual({success:true,job:finalJob,report:summary});
  const expected=privateReportOracle({owner,job:finalJob,summary,name:reportName,captureWindow:journal.captureWindow});journal.expected=expected;persist();
  const pages=async()=>{const rows=[];for(const section of Object.keys(summary.pages))for(let pageNo=0;pageNo<summary.pages[section];pageNo++)rows.push((await read('getSponsorReportPage',{planId:owner.planId,reportId:summary.id,section,page:pageNo})).page);expect(rows).toEqual(expected.pages);return rows;};await pages();
  const download=async(file:string)=>{const pending=page.waitForEvent('download',{timeout:180000});await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();const artifact=await pending;expect(artifact.suggestedFilename()).toBe(`sponsor-report-${summary.id}.html`);const path=info.outputPath(file);await artifact.saveAs(path);expect(await artifact.failure()).toBeNull();expect(fs.readFileSync(path,'utf8')).toBe(expected.html);record('private-html',{file,sha256:sha(fs.readFileSync(path)),bytes:fs.statSync(path).size});return path;};
  const html=await download('private-owner-report.html');record('private-document-step',{step:'open',event:'start'});documentPage=await page.context().newPage();record('private-document-step',{step:'open',event:'complete'});
  record('private-document-step',{step:'goto',event:'start'});await documentPage.goto(pathToFileURL(html).href);record('private-document-step',{step:'goto',event:'complete'});
  record('private-document-step',{step:'semantic',event:'start'});await expect(documentPage.locator('script,iframe,img,link')).toHaveCount(0);await expect(documentPage.locator('[data-issue-key="WFH-2820"]')).toHaveCount(1);await expect(documentPage.locator('body')).toContainText('Private simulation model');record('private-document-step',{step:'semantic',event:'complete'});
  record('private-document-step',{step:'screenshot',event:'start'});await settledScreenshot(documentPage,{subject:documentPage.locator('body'),path:info.outputPath('private-owner-report.png'),fullPage:true});record('private-document-step',{step:'screenshot',event:'complete'});
  record('private-document-step',{step:'close',event:'start'});await documentPage.close();documentPage=null;record('private-document-step',{step:'close',event:'complete'});
  frame=await openOwned(privateName);work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();report=work.locator('[data-testid="sponsor-reports"]');await report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button').filter({hasText:reportName}).click();expect((await read('getSponsorReport',{planId:owner.planId,reportId:summary.id})).report).toEqual(summary);await pages();await download('private-owner-report-reopened.html');
  await sourceUnchanged();await privateUnchanged();await issue();await standing();expect(await read('getCapacitySettings')).toEqual(settings);await principal();await session.stop();
  // Retention keeps the exact verified source, snapshot, model and report for subsequent inspection.
  if(retain){
   await drafts(source.meta.id);await drafts(owner.planId);
   expect(await read('getSponsorReportCapture',{planId:owner.planId,jobId:finalJob.id})).toEqual({success:true,job:finalJob,report:summary});
   expect((await read('getSponsorReport',{planId:owner.planId,reportId:summary.id})).report).toEqual(summary);await pages();
   journal.retained={sourcePlanId:source.meta.id,snapshotId:snapshot.id,snapshotHash:snapshot.hash,privatePlanId:owner.planId,generationId:owner.plan.simulationGeneration,reportId:summary.id,reportHash:summary.hash,jobId:finalJob.id,checkpoint:finalJob.checkpoint,settingsVersion:settings.version};
   journal.completed=true;persist();
  }else{
  // Mutations below happen once, after full positive ownership and public-output proof.
  expect(await session.invoke('deleteSponsorReport',{planId:owner.planId,reportId:summary.id},true)).toEqual({success:true,deleted:true});journal.reportDeleted=true;persist();
  const deletedState=await read('getSponsorReportCapture',{planId:owner.planId,jobId:finalJob.id});let cleaned=privateDeletedState(finalJob,deletedState.job);expect(deletedState).toEqual({success:true,job:cleaned});journal.deletedState=deletedState;persist();for(let n=0;n<20&&!cleaned.cleanupDone;n++){const result=await session.invoke('cancelSponsorReportCapture',{planId:owner.planId,jobId:finalJob.id},true);const next=privateCleanupStep(cleaned,result.job);expect(result).toEqual({success:true,job:next});cleaned=next;journal.cleaned=cleaned;persist();}expect(cleaned.cleanupDone).toBe(true);
  for(let n=0;n<2;n++){await privateUnchanged();expect(await read('getSponsorReportCapture',{planId:owner.planId,jobId:finalJob.id})).toEqual({success:true,job:cleaned});expect(await session.invoke('getSponsorReport',{planId:owner.planId,reportId:summary.id})).toEqual({success:false,error:'This sponsor report was deleted or is unavailable'});expect(await session.invoke('getSponsorReportPage',{planId:owner.planId,reportId:summary.id,section:'timeline',page:0})).toEqual({success:false,error:'This report is unavailable'});const listed=await read('listSponsorReports',{planId:owner.planId});expect(listed.entries).toEqual([]);expect(listed.cursor??null).toBeNull();}journal.publicAbsenceTwice=true;persist();
  frame=await openPlans(page);const card=frame.locator('.lz-card').filter({hasText:privateName});await expect(card.locator('[data-testid="plan-card-simulation"]')).toHaveText('Private simulation');await card.getByRole('button',{name:'More',exact:true}).click();await card.getByRole('button',{name:'Delete plan',exact:true}).click();expect(await perform('deletePlan',owner.planId,()=>frame.getByRole('dialog',{name:'Delete Plan',exact:true}).getByRole('button',{name:'Delete',exact:true}).click())).toEqual({success:true});await expect(card).toHaveCount(0);
  for(let n=0;n<2;n++){expect(await session.invoke('getPlan',{planId:owner.planId})).toEqual({success:false,error:'Plan not found'});await registry([...originals,source.meta.id]);}journal.privateDeleted=true;persist();
  await sourceUnchanged();await session.stop();await hook({what:'clearDrafts',planId:source.meta.id});expect(await hook({what:'deleteFixture',planId:source.meta.id})).toEqual({deleted:source.meta.id,registryRemoved:true});await proveDeletedPlanTwice({planId:source.meta.id,expectedRegistry:originals,readPlan:(planId:string)=>hook({what:'plan',planId}),readRegistry:async()=>{const result=await hook({what:'plans'});return result.plans.map((p:any)=>p.id);}});journal.sourceDeleted=true;journal.completed=true;persist();
  }
 }catch{bodyFailed=true;journal.failure='Private owner witness failed; exact known resources retained without retry';persist();throw new Error(journal.failure);}
 finally{
  const audits=[async()=>{if(documentPage&&!documentPage.isClosed())await documentPage.close();},principal,standing,issue,issue,async()=>{expect(await read('getCapacitySettings')).toEqual(settings);},async()=>{for(const id of originals)await drafts(id);},async()=>{const ids=[...originals,...(journal.owned.sourcePlanId&&!journal.sourceDeleted?[journal.owned.sourcePlanId]:[]),...(journal.observedPrivatePlanId&&!journal.privateDeleted?[journal.observedPrivatePlanId]:[])];await registry(ids);}];
  try{await finishPrivateWitness({journal,persist,stop:()=>session.stop(),audits});}finally{try{await session.dispose();}catch{journal.completed=false;journal.state='recovery-required';persist();throw new Error('Private owner witness observation remained incomplete');}if(bodyFailed){journal.completed=false;journal.state='recovery-required';persist();}}
 }
});
