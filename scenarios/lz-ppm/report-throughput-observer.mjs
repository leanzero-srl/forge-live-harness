import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {serializeForgeResponse,ForgeResponseRecordError} from './forge-response-record.mjs';

const phases=new Set(['preparation','capture','post-capture-audit','direct-page-audit','ui-download','source-checks','failure-cleanup','final-cleanup']);
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const hasErrors=value=>value!=null&&(!Array.isArray(value)||value.length>0);
/** Failed envelopes may themselves carry a renewed contextToken. Never persist it. */
export function failureEvidence(raw){
 const removedFields=[];let value;
 try{value=JSON.parse(raw);}catch{return {schema:'sanitized-rpc-failure-v1',originalSha256:hash(raw),originalBytes:Buffer.byteLength(raw),originalRawRetained:false,format:'unparseable',contentOmitted:true,removedFields:[]};}
 const secrets=new Set();
 const protectedKey=key=>/^(contextToken|headers|authorization|cookie|set-cookie)$/i.test(key);
 function collect(item){if(!item||typeof item!=='object')return;for(const[key,child]of Object.entries(item)){if(protectedKey(key)&&typeof child==='string'&&child)secrets.add(child);if(protectedKey(key)&&child&&typeof child==='object')for(const v of Object.values(child))if(typeof v==='string'&&v)secrets.add(v);collect(child);}}
 collect(value);let redactedStrings=0;
 function clean(item,path){if(typeof item==='string'){let text=item;for(const secret of secrets)if(text.includes(secret)){text=text.split(secret).join('[REDACTED]');redactedStrings++;}return text;}
  if(Array.isArray(item))return item.map((child,index)=>clean(child,`${path}[${index}]`));
  if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).filter(([key])=>{if(!protectedKey(key))return true;removedFields.push(`${path}.${key}`);return false;}).map(([key,child])=>[key,clean(child,`${path}.${key}`)]));return item;}
 return {schema:'sanitized-rpc-failure-v1',originalSha256:hash(raw),originalBytes:Buffer.byteLength(raw),originalRawRetained:false,format:'json',envelope:clean(value,'$'),removedFields,redactedStrings};
}

const errorData=error=>({name:error?.name??typeof error,message:String(error?.message??error)});
/** Optional helper seam. Observation is never awaited by the operation. */
export function observeCall(observer,method,...args){
 try{const value=observer?.[method]?.(...args);if(value?.then)value.catch(error=>{try{observer?.recordObserverFailure?.(error);}catch{}});return value;}
 catch(error){try{observer?.recordObserverFailure?.(error);}catch{}return undefined;}
}

/** Passive event receiver. It owns no transport, route, retry or rate policy. */
export function createReportThroughputObserver({page,extensionId,emit=(_event)=>{},saveFailure=(_id,_raw)=>{},saveResponse,now=()=>performance.now(),wall=()=>Date.now(),maxRecords=10000}){
 if(!/^ari:cloud:ecosystem::extension\/[\w-]+\/[\w-]+\/static\/ppm-dashboard$/.test(extensionId))throw new Error('Exact dashboard extension identity required');
 const records=new Map(),byRequest=new Map(),requestEvidence=new WeakMap(),pending=new Set(),errors=[];let nextId=0,lastClock=-Infinity,phase='preparation',closed=false,recordCount=0;
 const diagnostic=error=>{
  if(typeof saveResponse!=='function')return errorData(error);
  let detail;try{detail=String(error?.message??error);}catch{detail='Unprintable error';}
  return {name:'ObservedError',message:'Observed operation failed; original detail withheld',detailSha256:hash(detail),detailBytes:Buffer.byteLength(detail)};
 };
 const recordObserverFailure=error=>{errors.push({kind:'observer',...diagnostic(error)});};
 const safe=(work)=>{try{return work();}catch(error){recordObserverFailure(error);return undefined;}};
 const stamp=()=>{
  const monoMs=now(),wallMs=wall();if(!Number.isFinite(monoMs)||monoMs<lastClock||!Number.isFinite(wallMs)){recordObserverFailure(new Error('Invalid monotonic/wall observation clock'));return {monoMs:null,wallMs:null};}
  lastClock=monoMs;return {monoMs,wallMs};
 };
 const write=value=>{if(++recordCount>maxRecords){if(recordCount===maxRecords+1)recordObserverFailure(new Error('Observation record bound exceeded'));return;}
  safe(()=>{const result=emit(value);if(result?.then){const tracked=Promise.resolve(result).catch(recordObserverFailure);track(tracked);}});
 };
 function track(work){pending.add(work);work.finally(()=>pending.delete(work)).catch(recordObserverFailure);return work;}
 function event(record,type,at,extra={}){const value={type,id:record?.id??null,phase,at,...extra};if(record)record.events.push(value);write(value);}
 function start(kind,key,meta,at){const record={id:++nextId,kind,key,meta,phaseAtStart:phase,start:at,events:[],networkTerminal:null,bodyTerminal:null,outcome:null};records.set(record.id,record);event(record,'dispatch-observed',at,{kind,key,meta});return record;}
 function selectedCall(call){const p=call?.payload;return {planId:typeof p?.planId==='string'?p.planId:null,jobId:typeof p?.jobId==='string'?p.jobId:null,expectedCheckpoint:Number.isSafeInteger(p?.expectedCheckpoint)?p.expectedCheckpoint:null};}
 function readTiming(request){return safe(()=>{const t=request.timing();return Object.fromEntries(['startTime','domainLookupStart','domainLookupEnd','connectStart','secureConnectionStart','connectEnd','requestStart','responseStart','responseEnd'].map(k=>[k,Number.isFinite(t[k])?t[k]:null]));});}
 function jobSummary(job){if(!job||typeof job!=='object')return null;return Object.fromEntries(['id','checkpoint','state','cleanupDone','stageLabel','completedUnits','totalUnits','forecastRuns'].filter(k=>Object.hasOwn(job,k)).map(k=>[k,job[k]]));}
 function responseBody(record,response,at,{api=false,hook=false,clone=false,privacy={},requestCall}={}){
  const status=typeof response.status==='function'?response.status():response.status;record.status=status;
  const headers=typeof response.headers==='function'?response.headers():response.headers;
  const traceId=headers?.get?headers.get('atl-traceid'):headers?.['atl-traceid']??null;
  const trace=typeof saveResponse==='function'?{traceId:null,...(typeof traceId==='string'?{traceIdSha256:hash(traceId),traceIdBytes:Buffer.byteLength(traceId)}:{})}:{traceId};
  event(record,api?'api-response-available':'response-headers-observed',at,{httpStatus:status,...trace});
  const work=(async()=>{
   try{
    const raw=await (clone?response.clone():response).text();const terminal=stamp();record.bodyTerminal=terminal;
    let parsed,validJson=true;try{parsed=JSON.parse(raw);}catch{validJson=false;}
    const outer=hook?null:parsed?.data?.invokeExtension,body=hook?parsed:outer?.response?.body;
    const failures=[];if(!Number.isInteger(status)||status<200||status>=300)failures.push('http');if(!validJson)failures.push('json');
    if(!hook&&(!outer||outer.success!==true||!body||hasErrors(outer.errors)||hasErrors(parsed?.errors)))failures.push('invoke');
    if(body?.success===false)failures.push('body');
    if(hook&&(!parsed||typeof parsed!=='object'))failures.push('hook-body');
    record.outcome=failures.length||record.outcome==='failed'?'failed':'success';
    const summary={outcome:record.outcome,failures,responseSha256:hash(raw),responseBytes:Buffer.byteLength(raw),outerSuccess:outer?.success??null,bodySuccess:body?.success??null,job:jobSummary(body?.job)};
    let receipt,evidenceRefusal;
    if(typeof saveResponse==='function'){
     try{
      const options=typeof privacy==='function'?await privacy():privacy;
      const {data,...safeReceipt}=serializeForgeResponse(raw,options);receipt=safeReceipt;
      if(requestCall){const {data:callData,...callReceipt}=serializeForgeResponse(JSON.stringify(requestCall),options);receipt.requestCall=callReceipt;}
     }catch(error){receipt=null;evidenceRefusal=error instanceof ForgeResponseRecordError?error.receipt:{refusal:'response-evidence-unavailable'};}
    }
    if(evidenceRefusal){summary.job=null;summary.outerSuccess=typeof summary.outerSuccess==='boolean'?summary.outerSuccess:null;summary.bodySuccess=typeof summary.bodySuccess==='boolean'?summary.bodySuccess:null;}
    if(failures.length){errors.push({kind:'response',id:record.id,failures});
     // The optional strict corpus also fences the older failure sink: it must
     // never publish an opaque request credential echoed by an error response.
     const failure=typeof saveResponse!=='function'?failureEvidence(raw):{
      schema:'sanitized-rpc-failure-v1',originalSha256:hash(raw),originalBytes:Buffer.byteLength(raw),originalRawRetained:false,
      ...(receipt?{format:'json',envelope:JSON.parse(receipt.raw),removedFields:Object.hasOwn(parsed?.data?.invokeExtension??{},'contextToken')?['$.data.invokeExtension.contextToken']:[]}:{format:'withheld',contentOmitted:true,refusal:evidenceRefusal?.refusal}),
     };
     const evidence=JSON.stringify(failure),file=saveFailure(record.id,evidence);if(file?.then)await file;summary.failureEvidence={schema:'sanitized-rpc-failure-v1',sha256:hash(evidence),bytes:Buffer.byteLength(evidence),originalRawRetained:false};
    }
    event(record,'body-terminal',terminal,summary);
    // Optional full evidence is local work after the original body timing.
    // It neither changes a business outcome nor adds/awaits any product request.
    if(typeof saveResponse==='function'){
     if(receipt){try{
      await saveResponse(record.id,{...receipt,observerId:record.id,kind:record.kind,key:record.key,planId:record.meta.planId});
      event(record,'response-evidence-retained',stamp(),{responseSha256:receipt.responseSha256,retainedResponseSha256:receipt.retainedResponseSha256,retainedResponseBytes:receipt.retainedResponseBytes});
     }catch{evidenceRefusal={refusal:'response-evidence-sink-failed'};}}
     if(evidenceRefusal){errors.push({kind:'response-evidence',id:record.id,...evidenceRefusal});event(record,'response-evidence-refused',stamp(),evidenceRefusal);}
    }
   }catch(error){record.bodyTerminal=stamp();record.outcome='unknown';errors.push({kind:'body',id:record.id,...diagnostic(error)});event(record,'body-read-failed',record.bodyTerminal,{error:diagnostic(error)});}
  })();track(work);
 }
 const request=req=>safe(()=>{
  const at=stamp();const url=new URL(req.url());if(!/^\/gateway\/api\/graphql(?:\/pq\/[a-fA-F0-9]{64})?$/.test(url.pathname))return;
  let envelope;try{let raw=req.postDataBuffer();if(!raw)return;if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw);envelope=JSON.parse(raw.toString());}
  catch(error){errors.push({kind:'unclassified-graphql',...diagnostic(error)});event(null,'unclassified-graphql',at);return;}
  const input=envelope?.variables?.input;if(input?.extensionId!==extensionId)return;
  const call=input?.payload?.call;if(typeof call?.functionKey!=='string'||!call.functionKey){errors.push({kind:'unclassified-app-rpc'});event(null,'unclassified-app-rpc',at);return;}
  const record=start('ui',call.functionKey,selectedCall(call),at);byRequest.set(req,record);
  if(typeof saveResponse==='function')requestEvidence.set(req,{
   privacy:async()=>({requestToken:input.payload?.contextToken,requestHeaders:await req.allHeaders()}),
   requestCall:['captureSponsorReport','captureSnapshot'].includes(call.functionKey)?call:undefined,
  });
 });
 const response=res=>safe(()=>{const at=stamp(),req=res.request(),record=byRequest.get(req);if(record){const evidence=requestEvidence.get(req);requestEvidence.delete(req);responseBody(record,res,at,evidence);}});
 const finished=req=>safe(()=>{const at=stamp(),record=byRequest.get(req);if(!record)return;record.networkTerminal=at;event(record,'network-finished',at,{timing:readTiming(req)});});
 const failed=req=>safe(()=>{const at=stamp(),record=byRequest.get(req);if(!record)return;record.networkTerminal=at;record.outcome='failed';errors.push({kind:'transport',id:record.id,...diagnostic(req.failure()?.errorText)});event(record,'network-failed',at,{error:diagnostic(req.failure()?.errorText),timing:readTiming(req)});});
 page.on('request',request);page.on('response',response);page.on('requestfinished',finished);page.on('requestfailed',failed);
 const detached=()=>{page.off('request',request);page.off('response',response);page.off('requestfinished',finished);page.off('requestfailed',failed);};
 const snapshot=()=>({schema:'report-throughput-v1',extensionId,phase,closed,recordCount,records:[...records.values()],errors:[...errors],complete:false,productPassed:false});
 return {
  recordObserverFailure,
  mark(next){safe(()=>{if(!phases.has(next))throw new Error('Unknown throughput phase');phase=next;event(null,'phase',stamp());});},
  beginExternal(kind,key,meta={}){return safe(()=>{if(closed)throw new Error('Observer closed');if(!['rpc','hook'].includes(kind))throw new Error('Unknown external kind');return start(kind,key,{planId:typeof meta.planId==='string'?meta.planId:null},stamp()).id;});},
  externalResponse(id,response,privacy={}){safe(()=>{const record=records.get(id);if(!record)throw new Error('Unknown external response');responseBody(record,response,stamp(),{api:record.kind==='rpc',hook:record.kind==='hook',clone:record.kind==='hook',privacy});});},
  endExternal(id,error,failedCall=false){safe(()=>{const record=records.get(id);if(!record)throw new Error('Unknown external terminal');record.networkTerminal=stamp();
   if(failedCall){errors.push({kind:'external-operation',id,...diagnostic(error)});record.outcome='failed';}
   event(record,'external-consumer-terminal',record.networkTerminal,{failed:failedCall,...(failedCall?{error:diagnostic(error)}:{})});
  });},
  snapshot,
  async finish({timeoutMs=10000,requireCapture=false}={}){
   if(closed)throw new Error('Observer already closed');closed=true;page.off('request',request);let timer;
   // No wait is inserted into product execution. This is only a terminal local drain.
   try{await Promise.race([(async()=>{while(pending.size)await Promise.allSettled([...pending]);})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Observation body drain deadline')),timeoutMs);})]);}
   catch(error){recordObserverFailure(error);}finally{clearTimeout(timer);detached();}
   for(const r of records.values())if(!r.networkTerminal||(!r.bodyTerminal&&r.outcome!=='failed'))errors.push({kind:'incomplete',id:r.id});
   if(requireCapture){
    const ui=[...records.values()].filter(r=>r.kind==='ui');
    const begin=ui.filter(r=>r.key==='captureSponsorReport'),advances=ui.filter(r=>r.key==='advanceSponsorReportCapture');
    const replies=ui.flatMap(r=>r.events.filter(e=>e.type==='body-terminal'&&e.outcome==='success'));
    if(begin.length!==1||!advances.length||!replies.some(e=>e.job?.state==='complete'&&e.job?.cleanupDone===true))errors.push({kind:'capture-coverage',message:'Full UI begin/advance/cleaned publication was not observed'});
   }
   const result=snapshot();result.complete=errors.length===0;write({type:'observer-terminal',at:stamp(),complete:result.complete,errors:[...errors]});
   if(pending.size){let finalTimer;try{await Promise.race([Promise.allSettled([...pending]),new Promise((_,reject)=>{finalTimer=setTimeout(()=>reject(new Error('Terminal observation sink deadline')),timeoutMs);})]);}catch(error){recordObserverFailure(error);}finally{clearTimeout(finalTimer);}}
   result.errors=[...errors];result.complete=errors.length===0;
   return result;
  },
 };
}
