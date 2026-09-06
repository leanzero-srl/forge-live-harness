import {stopReportUi} from './report-departure';
import {observeCall} from './report-throughput-observer.mjs';
import fs from 'node:fs';
import {expect} from '../../fixtures/forge';
import {callOf,currentUserResolver} from './campaign-ui';
import {cleanReportCapture,verifyCaptureProbe,reportRecovery,observeCaptureProbe} from './report-capture-cleanup.mjs';
import {getTestState} from '../../testhook/client';
import {createReportCaptureObserver} from './report-capture-observer.mjs';

const sessionsByPage=new WeakMap<any,Map<string,any[]>>();

/** Install before the UI click. Only observe actual UI work; no polling advances. */
export function observeReportCapture(page:any,planId:string,info:any,label='report-capture',initialJob:any=null,observer:any=null) {
 const recorder=createReportCaptureObserver({planId,initialJob,onState:state=>fs.writeFileSync(info.outputPath(`${label}-protocol.json`),JSON.stringify(state,null,2))});
 const requests=new Set<any>();let queue=Promise.resolve();
 const enqueue=(work:()=>any)=>{queue=queue.then(work).catch(error=>recorder.fail(error));};
 const request=(req:any)=>{const call=callOf(req);if(call?.payload?.planId!==planId||!['captureSponsorReport','advanceSponsorReportCapture','getSponsorReportCapture','cancelSponsorReportCapture'].includes(call.functionKey))return;requests.add(req);enqueue(()=>recorder.request(req,call));};
 const response=(res:any)=>{const req=res.request();if(!requests.has(req))return;enqueue(async()=>{
  try{expect(res.status()).toBe(200);await res.finished();const outer=await res.json(),result=outer?.data?.invokeExtension;
   if(!result?.success||!result.response?.body)throw new Error(`${callOf(req)?.functionKey}: ${JSON.stringify(result?.errors||outer?.errors||'Missing resolver body')}`);
   recorder.response(req,result.response.body);
  }catch(error){recorder.transportFailure(req,error);}
 });};
 const failed=(req:any)=>{if(requests.has(req))enqueue(()=>recorder.transportFailure(req,new Error(`Capture request failed: ${req.failure()?.errorText||'unknown transport error'}`)));};
 page.on('request',request);page.on('response',response);page.on('requestfailed',failed);
 const rpc=currentUserResolver(page,c=>(c?.functionKey==='captureSponsorReport'||(initialJob&&c?.functionKey==='getSponsorReportCapture'))&&c.payload?.planId===planId,{observer});
 const session={recorder,invoke:rpc.invoke,settle:()=>queue,stop:()=>{page.off('request',request);page.off('response',response);page.off('requestfailed',failed);rpc.stop();recorder.dispose();}};
 let plans=sessionsByPage.get(page);if(!plans){plans=new Map();sessionsByPage.set(page,plans);}plans.set(planId,[...(plans.get(planId)||[]),session]);return session;
}

/** Complete means immutable publication, private cleanup and a fresh exact read. */
export async function captureReport(page:any,report:any,planId:string,info:any,{label='report-capture',timeoutMs=600000,onRecovery=(_error:any)=>{},observer=null}:any={}) {
 const session=observeReportCapture(page,planId,info,label,null,observer);
 try{
  await report.getByRole('button',{name:'Capture sponsor report',exact:true}).click();
  const result:any=await session.recorder.wait((state:any)=>!!state.job&&(['failed','cancelled'].includes(state.job.state)||(state.job.state==='complete'&&state.job.cleanupDone&&!!state.report)),timeoutMs);
  expect(result.job.state,result.job.error||'Capture did not complete').toBe('complete');expect(result.job.cleanupDone).toBe(true);
  observeCall(observer,'mark','post-capture-audit');
  const physical=await observeCaptureProbe(()=>getTestState('lz-ppm',{what:'reportCaptureState',planId,jobId:result.job.id},observer),(value:any)=>fs.writeFileSync(info.outputPath(`${label}-physical-probe.json`),JSON.stringify(value,null,2)));verifyCaptureProbe(physical,{planId,jobId:result.job.id,...result.job});expect(physical.privateArtifacts.length,'Completed capture retained nonempty cleanup manifest').toBeGreaterThan(0);
  const fresh=await session.invoke('getSponsorReport',{planId,reportId:result.job.reportId});expect(fresh.success).toBe(true);expect(fresh.report).toEqual(result.report);
  await expect(report.locator('[data-testid="report-capture-progress"]')).toContainText('Report captured and verified.');
  fs.writeFileSync(info.outputPath(`${label}-final.json`),JSON.stringify({job:result.job,report:fresh.report,freshRetainedRead:true,physicalCleanup:physical},null,2));return fresh.report;
 }catch(error){
  observeCall(observer,'mark','failure-cleanup');
  const observed=session.recorder.snapshot();
  if(observed.begin){try{await cleanReportCapture({planId,requestId:observed.begin.requestId,jobId:observed.job?.id,invoke:session.invoke,probe:(planId:string,jobId:string)=>getTestState('lz-ppm',{what:'reportCaptureState',planId,jobId},observer),stopUi:async()=>{await stopReportUi(page,async()=>{if(!page.isClosed())await page.goto('about:blank');});await session.settle();},onState:(state:any)=>fs.writeFileSync(info.outputPath(`${label}-cleanup.json`),JSON.stringify(state,null,2))});}
   catch(cleanupError){onRecovery(cleanupError);throw new AggregateError([error,cleanupError],'Report capture and cleanup failed; exact owned resources retained');}}
  throw error;
 }finally{session.stop();}
}

/** Called before deleting an owned fixture. Published UAT reports may be retained explicitly. */
export async function cleanupOwnedReportCaptures(page:any,planId:string,info:any,{retainPublished=false,onRecovery=(_error:any)=>{},observer=null}:any={}) {
 const plans=sessionsByPage.get(page),sessions=plans?.get(planId)||[];
 const probe=(planId:string,jobId:string)=>getTestState('lz-ppm',{what:'reportCaptureState',planId,jobId},observer);
 for(const [index,session] of sessions.entries()){
  const observed=session.recorder.snapshot();session.stop();if(!observed.begin)continue;
  const history:any[]=[];const save=(state:any)=>{history.push(state);fs.writeFileSync(info.outputPath(`report-owned-cleanup-${index}.json`),JSON.stringify(history,null,2));};
  try{
   const options={planId,requestId:observed.begin.requestId,jobId:observed.job?.id,invoke:session.invoke,probe,stopUi:async()=>{await stopReportUi(page,async()=>{if(!page.isClosed())await page.goto('about:blank');});await session.settle();},onState:save};
   const cleaned:any=await cleanReportCapture(options);
   if(cleaned.job?.state==='complete'&&!retainPublished){
    const read=await session.invoke('getSponsorReport',{planId,reportId:cleaned.job.reportId});expect(read.success).toBe(true);expect(read.report.id).toBe(cleaned.job.reportId);if(observed.report)expect(read.report).toEqual(observed.report);
    save({stage:'delete-owned-published-report',reportId:read.report.id,hash:read.report.hash});
    const removed=await session.invoke('deleteSponsorReport',{planId,reportId:read.report.id});expect(removed.success).toBe(true);
    const final:any=await cleanReportCapture({...options,jobId:cleaned.job.id});expect(final.job.state).toBe('cancelled');expect(final.cleaned).toBe(true);
   }
  }catch(error){const recovery=(error as any)?.code==='LZ_REPORT_CAPTURE_RECOVERY_REQUIRED'?error:reportRecovery(error,{planId,observed,history});onRecovery(recovery);throw recovery;}
 }
 plans?.delete(planId);
}
