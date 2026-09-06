import {withReportDeparture,setReportDepartureOwner,stopReportUi} from './report-departure';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {test,expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {withOwnedSchedule,table,editDuration,save} from './normalization-owned-fixture';
import {planning,actualResponse} from './campaign-ui';
import {observeReportCapture,cleanupOwnedReportCaptures} from './report-capture';
import {holdFirstReportAdvance,awaitHeldReportStep} from './report-capture-held-step';
import {verifyCaptureProbe,observeCaptureProbe} from './report-capture-cleanup.mjs';
import {settledScreenshot} from './settled-screenshot.mjs';
test.describe.configure({retries:0,timeout:900000});
const cases=[['resume','report jobs: paused source checkpoint survives reload and final publication pause, then full retained HTML'],['cancel','report jobs: cancellation during held real advance removes staged keys and refuses stale advance'],['source-drift','report jobs: changed owned source during pause refuses publication and cleans exact staging'],['baseline-drift','report jobs: changed active baseline during pause refuses publication and preserves original baseline']] as const;
for(const [kind,title]of cases)test(title,async({page},info)=>{
 await withReportDeparture(page,info,async()=>{
 await withOwnedSchedule(page,info,[{label:`report job ${kind}`,start:'2026-10-05',due:'2026-10-09',duration:5}],async(f)=>{
  const journal:any={kind,events:[]},retain=()=>fs.writeFileSync(info.outputPath('report-job-journal.json'),JSON.stringify(journal,null,2));
  const event=(e:any)=>{journal.events.push(e);retain();};let session:any,held:any,finalHeld:any,bodyError:any;
  const proof=(planId:string,jobId:string)=>observeCaptureProbe(()=>getTestState('lz-ppm',{what:'reportCaptureState',planId,jobId}),(value:any)=>{journal.probeObservations=[...(journal.probeObservations||[]),value];retain();});
  try{
   const original=await f.read(f.keys[0]);journal.originalJira=original;let frame=await table(page,f.name),work=await planning(frame),baseline:any;
   if(kind==='baseline-drift'){
    await work.getByLabel('Capture name',{exact:true}).fill('Pinned job baseline');await work.locator('form').getByRole('combobox').first().click();await frame.getByRole('option',{name:'Baseline',exact:true}).click();const read=actualResponse(page,'getSnapshot',f.planId);await work.getByRole('button',{name:'Capture working plan',exact:true}).click();baseline=(await read).snapshot;await work.getByRole('button',{name:'Use as baseline',exact:true}).click();await expect(work).toContainText('Baseline set to Pinned job baseline');journal.baseline=baseline;retain();
   }
   await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();let report=work.locator('[data-testid="sponsor-reports"]');const name=`Bounded ${kind} report`;await report.getByLabel('Report name',{exact:true}).fill(name);
   session=observeReportCapture(page,f.planId,info,`job-${kind}`);held=await holdFirstReportAdvance(page,f.planId,event);
   await report.getByRole('button',{name:'Capture sponsor report',exact:true}).click();
   const first=await awaitHeldReportStep(held,120000) as any;
   expect(first.responseStatus).toBe(200);expect(first.body.success).toBe(true);expect(first.body.job).toMatchObject({state:'active',checkpoint:1,cleanupDone:false});
   const before=await proof(f.planId,first.body.job.id);verifyCaptureProbe(before,{planId:f.planId,jobId:first.body.job.id,...first.body.job});expect(before.privateArtifacts.length).toBeGreaterThan(0);expect(before.privateArtifacts.some((r:any)=>r.present)).toBe(true);journal.beforeCleanup=before;retain();
   if(kind==='cancel'){
    await report.getByRole('button',{name:'Cancel capture',exact:true}).click();held.release();const ended:any=await session.recorder.wait((s:any)=>s.job?.state==='cancelled'&&s.job.cleanupDone,120000);await expect(report.locator('[data-testid="report-capture-progress"]')).toContainText('Capture cancelled. Its temporary data has been removed.');
    const after=await proof(f.planId,ended.job.id);verifyCaptureProbe(after,{planId:f.planId,jobId:ended.job.id,...ended.job},before);journal.cancelled=after;await settledScreenshot(report.locator('[data-testid="report-capture-progress"]'),{path:info.outputPath('report-job-cancelled.png')});
    session.stop();const stale=await session.invoke('advanceSponsorReportCapture',{planId:f.planId,jobId:ended.job.id,expectedCheckpoint:0});expect(stale).toMatchObject({success:false,error:'This report checkpoint changed. Reload capture status before resuming.'});const still=await session.invoke('getSponsorReportCapture',{planId:f.planId,jobId:ended.job.id});expect(still.success).toBe(true);expect(still.job).toEqual(ended.job);expect((await session.invoke('listSponsorReports',{planId:f.planId})).entries).toEqual([]);journal.staleRefusal=stale;retain();
   }else{
    await report.getByRole('button',{name:'Pause capture',exact:true}).click();held.release();await expect(report.getByRole('button',{name:'Resume capture',exact:true})).toBeVisible();await session.recorder.wait((s:any)=>s.job?.checkpoint===1,120000);await held.stop();held=null;
    const count=()=>session.recorder.snapshot().events.filter((e:any)=>e.type==='request'&&e.key==='advanceSponsorReportCapture').length;
    const admittedCount=count();expect(admittedCount).toBe(1);
    for(let n=0;n<2;n++){const status=await session.invoke('getSponsorReportCapture',{planId:f.planId,jobId:first.body.job.id});expect(status.success).toBe(true);expect(status.job).toEqual(first.body.job);}await session.settle();expect(count()).toBe(admittedCount);
    if(kind==='resume'){
     await page.reload();frame=await table(page,f.name);work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();report=work.locator('[data-testid="sponsor-reports"]');await expect(report.getByRole('button',{name:'Resume capture',exact:true})).toBeVisible();await expect(report.locator('[data-testid="report-capture-progress"]')).toContainText(name);await expect(report.getByLabel('Report name',{exact:true})).toBeDisabled();await session.settle();expect(count()).toBe(admittedCount);await settledScreenshot(report.locator('[data-testid="report-capture-progress"]'),{path:info.outputPath('report-job-resumed-identity.png')});
     finalHeld=await holdFirstReportAdvance(page,f.planId,event,(body:any)=>body?.job?.state==='complete'&&!body.job.cleanupDone);
     await report.getByRole('button',{name:'Resume capture',exact:true}).click();const final=await awaitHeldReportStep(finalHeld,180000) as any;expect(final.body.success).toBe(true);expect(final.body.report.id).toBe(final.body.job.reportId);
     const cancellations=()=>session.recorder.snapshot().events.filter((e:any)=>e.type==='request'&&e.key==='cancelSponsorReportCapture').length;
     expect(cancellations()).toBe(0);await report.getByRole('button',{name:'Pause capture',exact:true}).click();finalHeld.release();await expect(report.getByRole('button',{name:'Finish capture cleanup',exact:true})).toBeVisible();await session.recorder.wait((s:any)=>s.job?.state==='complete'&&!s.job.cleanupDone,120000);
     for(let n=0;n<2;n++){const status=await session.invoke('getSponsorReportCapture',{planId:f.planId,jobId:first.body.job.id});expect(status.success).toBe(true);expect(status.job.cleanupDone).toBe(false);}await session.settle();expect(cancellations()).toBe(0);journal.publicationPaused=await proof(f.planId,first.body.job.id);expect(journal.publicationPaused.privateArtifacts.some((r:any)=>r.present)).toBe(true);retain();await settledScreenshot(report.locator('[data-testid="report-capture-progress"]'),{path:info.outputPath('report-job-publication-paused.png')});
     await report.getByRole('button',{name:'Finish capture cleanup',exact:true}).click();const completed:any=await session.recorder.wait((s:any)=>s.job?.state==='complete'&&s.job.cleanupDone,180000);const physical=await proof(f.planId,completed.job.id);verifyCaptureProbe(physical,{planId:f.planId,jobId:completed.job.id,...completed.job},journal.publicationPaused);const retained=await session.invoke('getSponsorReport',{planId:f.planId,reportId:completed.job.reportId});expect(retained.success).toBe(true);expect(retained.report).toEqual(final.body.report);expect(retained.report).toMatchObject({name,counts:{timeline:1},plannedFinish:'2026-10-09',uncertainty:'medium'});journal.report=retained.report;retain();
     await report.getByRole('button',{name:'Open captured report',exact:true}).click();const downloaded=page.waitForEvent('download',{timeout:120000});await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();const file=await downloaded;expect(file.suggestedFilename()).toBe(`sponsor-report-${retained.report.id}.html`);const target=info.outputPath('paused-resumed-actual-report.html');await file.saveAs(target);const doc=await page.context().newPage();try{await doc.goto(pathToFileURL(target).href);await expect(doc.locator('tr[data-issue-key]')).toHaveCount(1);const row=doc.locator(`tr[data-issue-key="${f.keys[0]}"]`);const cells=await row.locator('td').allTextContents();expect(cells.slice(0,6).map((s:string)=>s.trim())).toEqual([f.keys[0],`${f.name} report job ${kind}`,'2026-10-05','2026-10-09','5','new']);await settledScreenshot(row,{path:info.outputPath('paused-resumed-report-row.png')});}finally{await doc.close();}
    }else{
     if(kind==='source-drift'){frame=await table(page,f.name);await editDuration(frame,f.keys[0],'7');await save(frame);expect(await f.read(f.keys[0])).toEqual(original);const changed=await getTestState('lz-ppm',{what:'plan',planId:f.planId});expect(changed.issues.find((i:any)=>i.key===f.keys[0]).duration).toBe(7);journal.changedOwnedSource=changed.issues;work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();report=work.locator('[data-testid="sponsor-reports"]');}
     else{expect((await session.invoke('clearBaseline',{planId:f.planId})).success).toBe(true);expect((await session.invoke('getBaseline',{planId:f.planId})).baseline).toBeNull();expect((await session.invoke('getSnapshot',{planId:f.planId,snapshotId:baseline.id})).snapshot).toEqual(baseline);}
     const refusal=session.recorder.wait(()=>false,180000).then(()=>{throw new Error('Refusal was not observed');},(error:any)=>error);await report.getByRole('button',{name:'Resume capture',exact:true}).click();const error=await refusal;expect(String(error.message)).toMatch(kind==='baseline-drift'?/baseline.*changed/i:/changed|stable|version/i);await expect(report.getByRole('alert').first()).toContainText(kind==='baseline-drift'?'baseline':'changed');if(baseline)expect((await session.invoke('getSnapshot',{planId:f.planId,snapshotId:baseline.id})).snapshot).toEqual(baseline);journal.refusal=String(error.message);await settledScreenshot(report.getByRole('alert').first(),{path:info.outputPath(`report-job-${kind}-refused.png`)});expect((await session.invoke('listSponsorReports',{planId:f.planId})).entries).toEqual([]);retain();
    }
   }
   expect(await f.read(f.keys[0])).toEqual(original);
  }catch(error){bodyError=error;journal.bodyError=String(error);retain();throw error;}
  finally{
   const errors:any[]=[];for(const h of [held,finalHeld])if(h)try{await h.stop();}catch(e){errors.push(e);}
   if(session)try{await cleanupOwnedReportCaptures(page,f.planId,info,{onRecovery:f.retainForRecovery});journal.captureCleanupVerified=true;}catch(e){errors.push(e);}
   retain();if(errors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...errors],'Report job body/cleanup failure; exact recovery state retained');
  }
 });
 });
});
