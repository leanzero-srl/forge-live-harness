import {createReportDocumentIdentity} from './report-document-identity.mjs';
import fs from 'node:fs';
import {expect} from '../../fixtures/forge';
import {callEnvelope} from './campaign-ui';
import {getTarget} from '../../config/targets';
import {departOwnedPlan,armPresenceLeave} from './owned-plan-departure.mjs';
import {serializeForgeResponse,ForgeResponseRecordError} from './forge-response-record.mjs';

const sessions=new WeakMap<any,any>();
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/** Report-only registration. It observes existing traffic and never routes or sends an RPC. */
export function installReportDeparture(page:any,{record=(_stage:string,_value:any)=>{},accountId=process.env.LZ_EXPECTED_ACCOUNT_ID,timeoutMs=120000}:any={}){
 if(sessions.has(page))throw new Error('Report departure already registered');
 if(typeof accountId!=='string'||!accountId)throw new Error('Expected account required for report departure');
 const target=getTarget('lz-ppm-dashboard'),extensionId=`ari:cloud:ecosystem::extension/${target.appId.split('/').at(-1)}/${target.envId}/static/ppm-dashboard`;
 const requests=new Map<any,any>(),pending=new Set<Promise<any>>(),leaves=new Set<(value:any)=>void>(),receipts:any[]=[],observationErrors:any[]=[];
 let owner:any=null,nextId=0,disposed=false,departing=false,departureFailure:any=null;
 const emit=(stage:string,value:any)=>record(stage,value);
 const documents=createReportDocumentIdentity({page,appId:target.appId.split('/').at(-1),envId:target.envId,record:emit,timeoutMs});
 let latestBeat:any=null,phase='idle';
 const request=(req:any)=>{const envelope=callEnvelope(req),input=envelope?.variables?.input;if(input?.extensionId!==extensionId)return;const call=input.payload?.call;if(typeof call?.functionKey!=='string')return;const value={requestId:++nextId,key:call.functionKey,planId:call.payload?.planId??null,requestedAtMs:Date.now(),ownerAtRequest:owner?.planId??null};requests.set(req,{...value,document:call.functionKey==='presenceBeat'?documents.capture(value.requestId):null});};
 const terminal=(req:any,failed:boolean)=>{
  const initial=requests.get(req);if(!initial)return;requests.delete(req);
  const operation=(async()=>{const {document:documentBinding,...metadata}=initial;const value:any={...metadata,dispatchedAtMs:initial.requestedAtMs,completedAtMs:Date.now(),state:failed?'failed':'finished',dispatchTiming:'request-event-observed'};
   if(failed)value.error='Observed app request failed';
   else if(['presenceBeat','presenceLeave'].includes(value.key)){
    const response=await req.response();value.httpStatus=response?.status()??null;
    try{const envelope=callEnvelope(req),serialized=serializeForgeResponse(response?await response.text():'',{requestToken:envelope?.variables?.input?.payload?.contextToken,requestHeaders:await req.allHeaders()});const {data,...safe}=serialized;Object.assign(value,safe);const extension=data?.data?.invokeExtension;value.outerSuccess=extension?.success??null;value.errors=extension?.errors??data?.errors??null;value.body=extension?.response?.body??null;}
    catch(error){if(error instanceof ForgeResponseRecordError)Object.assign(value,error.receipt);else value.observationError='Presence response could not be read';observationErrors.push(new Error('Presence response observation failed'));}
   }
   if(value.key==='presenceBeat'){value.documentEpoch=documentBinding.epoch;value.currentDocument=await documents.current(documentBinding);if(value.currentDocument){if(latestBeat)await documents.release(latestBeat.binding);latestBeat={binding:documentBinding,value};}else await documents.release(documentBinding);}
   receipts.push(value);emit('report-departure-request-terminal',value);for(const observe of leaves)observe(value);
  })();pending.add(operation);operation.catch(()=>observationErrors.push(new Error('Report departure evidence could not be retained'))).finally(()=>pending.delete(operation));
 };
 const finished=(req:any)=>terminal(req,false),failed=(req:any)=>terminal(req,true);
 page.on('request',request);page.on('requestfinished',finished);page.on('requestfailed',failed);
 const drain=async()=>{const deadline=performance.now()+timeoutMs;while(requests.size||pending.size){if(performance.now()>=deadline)throw new Error('Report departure request drain exceeded its bound');await Promise.race([pause(25),...(pending.size?[Promise.allSettled([...pending])]:[])]);}if(observationErrors.length)throw new AggregateError(observationErrors,'Report departure observation failed');};
 const waitForSurface=async()=>{const deadline=performance.now()+Math.min(timeoutMs,60000);while(true){if(page.url()==='about:blank')return;for(const frame of page.frames().filter(documents.matches)){const back=frame.locator('button[aria-label="Back to plans"][title="Back to plans"]'),cap=frame.locator('[data-testid="capacity-view"]'),list=frame.getByText('LZPT Scenarios',{exact:true}).first();if(await back.count()&&await back.first().isVisible()||await cap.count()&&await cap.isVisible()||await list.count()&&await list.isVisible())return;}if(performance.now()>=deadline)throw new Error('Positive report surface did not become ready');await pause(25);}};
 const stop=async()=>{
  if(departureFailure)throw departureFailure;if(disposed)throw new Error('Report departure disposed');if(departing)throw new Error('Overlapping report departure');departing=true;
  try{phase='surface-readiness';await waitForSurface();phase='drain';await departOwnedPlan({planId:owner?.planId,drain,record:emit,
   findMounted:async()=>{phase='mounted-identity';const found:any[]=[];for(const frame of page.frames().filter(documents.matches)){const back=frame.locator('button[aria-label="Back to plans"][title="Back to plans"]');if(await back.count()&&await back.first().isVisible())found.push({frame,back});}if(!found.length)return null;expect(found).toHaveLength(1);if(!owner)throw new Error('Mounted PlanView lacks exact report ownership');const mounted=found[0];await expect(mounted.back).toHaveCount(1);await expect(mounted.frame.getByText(owner.name,{exact:true})).toBeVisible();phase='presence-document-admission';const r=latestBeat?.value;const checks={sameFrame:latestBeat?.binding.frame===mounted.frame,currentDocument:!!latestBeat&&await documents.current(latestBeat.binding),exactOwner:r?.planId===owner.planId,finished:r?.state==='finished',http200:r?.httpStatus===200,outerSuccess:r?.outerSuccess===true,errorsEmpty:r?.errors==null||Array.isArray(r.errors)&&r.errors.length===0,exactPrincipal:r?.body?.selfAccountId===accountId};emit('report-departure-admission',{phase,nextId,documentEpoch:documents.epoch,beatRequestId:r?.requestId??null,checks});expect(Object.values(checks).every(Boolean)).toBe(true);return mounted;},
   confirmNonPlan:async()=>{if(page.url()==='about:blank')return;let known=false;for(const frame of page.frames().filter(documents.matches)){const capacity=frame.locator('[data-testid="capacity-view"]');if(await capacity.count()&&await capacity.isVisible()){await expect(capacity.getByRole('heading',{name:'Portfolio capacity',exact:true})).toBeVisible();known=true;continue;}const card=frame.getByText('LZPT Scenarios',{exact:true}).first();if(await card.count()&&await card.isVisible())known=true;}expect(known,'Positive Plan list or Capacity surface required').toBe(true);},
   armLeave:()=>armPresenceLeave(leaves,{timeoutMs}),clickBack:async(mounted:any)=>{phase='back-and-leave';await mounted.back.click();},confirmUnmounted:async(mounted:any)=>{await expect(mounted.back).toHaveCount(0);await expect(mounted.frame.getByText('LZPT Scenarios',{exact:true}).first()).toBeVisible();},blank:async()=>{phase='blank-after-proof';await page.goto('about:blank');}
  });}catch(error){const failure:any=new Error('Owned report departure failed; exact fixture retained');failure.code='LZ_REPORT_CAPTURE_RECOVERY_REQUIRED';failure.reportState={planId:owner?.planId??null,owner,departureFailed:true};departureFailure=failure;emit('report-departure-failed-retained',{...failure.reportState,phase,nextId,documentEpoch:documents.epoch,errorType:(error as any)?.name??typeof error});throw failure;}finally{departing=false;}
 };
 const session={
  own(planId:string,name:string){if(typeof planId!=='string'||!planId.startsWith('plan-test-')||typeof name!=='string'||!name.startsWith('[harness-test]'))throw new Error('Exact owned report fixture required');if(owner&&(owner.planId!==planId||owner.name!==name))throw new Error('Report owner cannot change during a journey');owner={planId,name};emit('report-departure-owner',owner);},
  stop,
  failure:()=>departureFailure,
  async dispose(){if(disposed)return;const errors:any[]=[];try{await drain();}catch(error){errors.push(error);}try{await documents.dispose();}catch(error){errors.push(error);}finally{disposed=true;page.off('request',request);page.off('requestfinished',finished);page.off('requestfailed',failed);sessions.delete(page);emit('report-departure-disposed',{owner,receipts:receipts.length});}if(errors.length)throw new AggregateError(errors,'Report departure disposal failed');},
 };
 sessions.set(page,session);return session;
}
export function reportDepartureFailure(page:any){return sessions.get(page)?.failure()??null;}
export function setReportDepartureOwner(page:any,planId:string,name:string){sessions.get(page)?.own(planId,name);}
/** Called only before ordinary helper navigation. Intentional page.reload remains untouched. */
export async function beforeReportNavigation(page:any){const session=sessions.get(page);if(session&&!page.isClosed())await session.stop();}
export async function stopReportUi(page:any,unchangedDefault:()=>Promise<any>){const session=sessions.get(page);if(!session)return unchangedDefault();if(!page.isClosed())await session.stop();}
export async function withReportDeparture(page:any,info:any,work:()=>Promise<any>){
 fs.mkdirSync(info.outputDir,{recursive:true});const events:any[]=[];const record=(stage:string,value:any)=>{events.push({stage,time:new Date().toISOString(),value});fs.writeFileSync(info.outputPath('report-departure.json'),JSON.stringify(events,null,2));};
 const session=installReportDeparture(page,{record});let bodyFailed=false,bodyError:any;
 try{return await work();}catch(error){bodyFailed=true;bodyError=error;throw error;}
 finally{try{await session.dispose();}catch(error){throw new AggregateError([...(bodyFailed?[bodyError]:[]),error],'Report journey and departure observation failed');}}
}
