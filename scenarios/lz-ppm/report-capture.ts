import fs from 'node:fs';
import {expect} from '../../fixtures/forge';
import {callOf,currentUserResolver} from './campaign-ui';
import {createReportCaptureObserver} from './report-capture-observer.mjs';

/** Install before the UI click. Only observe actual UI work; no polling advances. */
export function observeReportCapture(page:any,planId:string,info:any,label='report-capture') {
 const recorder=createReportCaptureObserver({planId,onState:state=>fs.writeFileSync(info.outputPath(`${label}-protocol.json`),JSON.stringify(state,null,2))});
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
 const rpc=currentUserResolver(page,c=>c?.functionKey==='captureSponsorReport'&&c.payload?.planId===planId);
 return {recorder,invoke:rpc.invoke,settle:()=>queue,stop:()=>{page.off('request',request);page.off('response',response);page.off('requestfailed',failed);rpc.stop();recorder.dispose();}};
}

/** Complete means immutable publication, private cleanup and a fresh exact read. */
export async function captureReport(page:any,report:any,planId:string,info:any,{label='report-capture',timeoutMs=600000}={}) {
 const session=observeReportCapture(page,planId,info,label);
 try{
  await report.getByRole('button',{name:'Capture sponsor report',exact:true}).click();
  const result:any=await session.recorder.wait((state:any)=>!!state.job&&(['failed','cancelled'].includes(state.job.state)||(state.job.state==='complete'&&state.job.cleanupDone&&!!state.report)),timeoutMs);
  expect(result.job.state,result.job.error||'Capture did not complete').toBe('complete');expect(result.job.cleanupDone).toBe(true);
  const fresh=await session.invoke('getSponsorReport',{planId,reportId:result.job.reportId});expect(fresh.success).toBe(true);expect(fresh.report).toEqual(result.report);
  await expect(report.locator('[data-testid="report-capture-progress"]')).toContainText('Report captured and verified.');
  fs.writeFileSync(info.outputPath(`${label}-final.json`),JSON.stringify({job:result.job,report:fresh.report,freshRetainedRead:true},null,2));return fresh.report;
 }finally{session.stop();}
}
