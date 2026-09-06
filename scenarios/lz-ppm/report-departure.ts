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
 let owner:any=null,nextId=0,lastBlank=0,disposed=false,departing=false,departureFailure:any=null;
 const emit=(stage:string,value:any)=>record(stage,value);
 const request=(req:any)=>{const envelope=callEnvelope(req),input=envelope?.variables?.input;if(input?.extensionId!==extensionId)return;const call=input.payload?.call;if(typeof call?.functionKey!=='string')return;const value={requestId:++nextId,key:call.functionKey,planId:call.payload?.planId??null,requestedAtMs:Date.now(),ownerAtRequest:owner?.planId??null};requests.set(req,value);};
 const terminal=(req:any,failed:boolean)=>{
  const initial=requests.get(req);if(!initial)return;requests.delete(req);
  const operation=(async()=>{const value:any={...initial,dispatchedAtMs:initial.requestedAtMs,completedAtMs:Date.now(),state:failed?'failed':'finished',dispatchTiming:'request-event-observed'};
   if(failed)value.error='Observed app request failed';
   else if(['presenceBeat','presenceLeave'].includes(value.key)){
    const response=await req.response();value.httpStatus=response?.status()??null;
    try{const envelope=callEnvelope(req),serialized=serializeForgeResponse(response?await response.text():'',{requestToken:envelope?.variables?.input?.payload?.contextToken,requestHeaders:await req.allHeaders()});const {data,...safe}=serialized;Object.assign(value,safe);const extension=data?.data?.invokeExtension;value.outerSuccess=extension?.success??null;value.errors=extension?.errors??data?.errors??null;value.body=extension?.response?.body??null;}
    catch(error){if(error instanceof ForgeResponseRecordError)Object.assign(value,error.receipt);else value.observationError='Presence response could not be read';observationErrors.push(new Error('Presence response observation failed'));}
   }
   receipts.push(value);emit('report-departure-request-terminal',value);for(const observe of leaves)observe(value);
  })();pending.add(operation);operation.catch(()=>observationErrors.push(new Error('Report departure evidence could not be retained'))).finally(()=>pending.delete(operation));
 };
 const finished=(req:any)=>terminal(req,false),failed=(req:any)=>terminal(req,true);
 const navigated=(frame:any)=>{if(frame===page.mainFrame())lastBlank=nextId;};
 page.on('request',request);page.on('requestfinished',finished);page.on('requestfailed',failed);page.on('framenavigated',navigated);
 const drain=async()=>{const deadline=performance.now()+timeoutMs;while(requests.size||pending.size){if(performance.now()>=deadline)throw new Error('Report departure request drain exceeded its bound');await Promise.race([pause(25),...(pending.size?[Promise.allSettled([...pending])]:[])]);}if(observationErrors.length)throw new AggregateError(observationErrors,'Report departure observation failed');};
 const stop=async()=>{
  if(departureFailure)throw departureFailure;if(disposed)throw new Error('Report departure disposed');if(departing)throw new Error('Overlapping report departure');departing=true;
  try{await departOwnedPlan({planId:owner?.planId,drain,record:emit,
   findMounted:async()=>{const found:any[]=[];for(const frame of page.frames()){const back=frame.locator('button[aria-label="Back to plans"][title="Back to plans"]');if(await back.count()&&await back.first().isVisible())found.push({frame,back});}if(!found.length)return null;expect(found).toHaveLength(1);if(!owner)throw new Error('Mounted PlanView lacks exact report ownership');const mounted=found[0];await expect(mounted.back).toHaveCount(1);await expect(mounted.frame.getByText(owner.name,{exact:true})).toBeVisible();expect(receipts.some(r=>r.requestId>lastBlank&&r.key==='presenceBeat'&&r.planId===owner.planId&&r.state==='finished'&&r.httpStatus===200&&r.outerSuccess===true&&(r.errors==null||Array.isArray(r.errors)&&r.errors.length===0)&&r.body?.selfAccountId===accountId)).toBe(true);return mounted;},
   confirmNonPlan:async()=>{if(page.url()==='about:blank')return;let known=false;for(const frame of page.frames()){const capacity=frame.locator('[data-testid="capacity-view"]');if(await capacity.count()&&await capacity.isVisible()){await expect(capacity.getByRole('heading',{name:'Portfolio capacity',exact:true})).toBeVisible();known=true;continue;}const card=frame.getByText('LZPT Scenarios',{exact:true}).first();if(await card.count()&&await card.isVisible())known=true;}expect(known,'Positive Plan list or Capacity surface required').toBe(true);},
   armLeave:()=>armPresenceLeave(leaves,{timeoutMs}),clickBack:async(mounted:any)=>mounted.back.click(),confirmUnmounted:async(mounted:any)=>{await expect(mounted.back).toHaveCount(0);await expect(mounted.frame.getByText('LZPT Scenarios',{exact:true}).first()).toBeVisible();},blank:async()=>{await page.goto('about:blank');lastBlank=nextId;}
  });}catch(error){const failure:any=new Error('Owned report departure failed; exact fixture retained');failure.code='LZ_REPORT_CAPTURE_RECOVERY_REQUIRED';failure.reportState={planId:owner?.planId??null,owner,departureFailed:true};departureFailure=failure;emit('report-departure-failed-retained',{...failure.reportState,errorType:(error as any)?.name??typeof error});throw failure;}finally{departing=false;}
 };
 const session={
  own(planId:string,name:string){if(typeof planId!=='string'||!planId.startsWith('plan-test-')||typeof name!=='string'||!name.startsWith('[harness-test]'))throw new Error('Exact owned report fixture required');if(owner&&(owner.planId!==planId||owner.name!==name))throw new Error('Report owner cannot change during a journey');owner={planId,name};emit('report-departure-owner',owner);},
  stop,
  failure:()=>departureFailure,
  async dispose(){if(disposed)return;try{await drain();}finally{disposed=true;page.off('request',request);page.off('requestfinished',finished);page.off('requestfailed',failed);page.off('framenavigated',navigated);sessions.delete(page);emit('report-departure-disposed',{owner,receipts:receipts.length});}},
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
