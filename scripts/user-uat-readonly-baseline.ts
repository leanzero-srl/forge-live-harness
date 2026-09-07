import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {chromium} from '@playwright/test';
import {createPortableLauncher,verifyPortableIdentity,APP_URL,getPortableReceipt} from '../forge/portable-browser.mjs';
import {installHostFlagSuppressor} from '../forge/browser';
import {loadEnv} from '../data/env.mjs';
import {serializeForgeResponse} from '../scenarios/lz-ppm/forge-response-record.mjs';
import {replayHeaders} from '../scenarios/lz-ppm/replay-headers.mjs';
import {assertCapacityWireFresh} from '../scenarios/lz-ppm/capacity-wire-lifecycle.mjs';
import {createRollingReadBudget} from '../scenarios/lz-ppm/rolling-read-budget.mjs';

// One explicitly dispatched read-only baseline. No original plan is mounted.
const root='/Users/mihaiperdum/Projects/forge-live-harness';
const directory=path.join(root,'evidence/lz-campaign/user-uat-readonly-baseline-20260907');
const privateDirectory='/private/tmp/lz-user-uat-baseline-20260907';
const ids=['plan-mtbrlh8n-7ghw8u','plan-mta3aw3t-6dyijd'];
const extension='ari:cloud:ecosystem::extension/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77/static/ppm-dashboard';
const account='712020:937bc860-eec2-4294-a65d-8e0fe7c45086';
const sha=(v:any)=>createHash('sha256').update(v).digest('hex');
const summary=(value:any)=>{const raw=JSON.stringify(value);return {sha256:sha(raw),bytes:Buffer.byteLength(raw)};};
const emptyErrors=(v:any)=>v==null||(Array.isArray(v)&&v.length===0);
const uiReads=new Set(['listPlans','checkUserRole','getCapacitySettings','getAiConfig','getFieldConfig']);
const planReads=new Set(['getPlan','getDraft','getActiveDrafts','getLockStatus','getSponsorReportCapture','listSponsorReports']);
function admit(key:string,payload:any,ui=false){
 assert.ok(ui?uiReads.has(key):planReads.has(key)||key==='getCapacitySettings','UNRECOGNIZED_READ');
 if(planReads.has(key))assert.deepEqual(Object.keys(payload),['planId']);
 else assert.deepEqual(payload??{},{});
 if(payload?.planId)assert.ok(ids.includes(payload.planId),'FOREIGN_PLAN');
}
const receipt:any={schema:'user-uat-readonly-baseline-v1',startedAt:new Date().toISOString(),ids,principal:account,uiVersion:'4.58.589',appSource:'40577cbfadf794ede8a8f184292e2b73a4ed7f89',reads:[],ui:[],budget:[],sources:[],passed:false};
const persist=()=>fs.writeFileSync(path.join(directory,'baseline.json'),JSON.stringify(receipt,null,2));
let stopped=false,wire:any,context:any,page:any;const pending=new Set<Promise<any>>();
const fail=(code:string)=>{stopped=true;throw new Error(code);};
const check=()=>{if(stopped)throw new Error('BASELINE_STOPPED');};
const budget=createRollingReadBudget({onEvent:event=>{receipt.budget.push(event);persist();}});
const closePhases:any[]=[];
const parseRequest=(request:any)=>{try{let b=request.postDataBuffer();if(!b)return null;if(b[0]===31&&b[1]===139)b=gunzipSync(b);return JSON.parse(b.toString());}catch{return null;}};
const responseBody=(record:any)=>{
 const envelope=record.data,invoke=envelope?.data?.invokeExtension;
 if(!emptyErrors(envelope?.errors)||!invoke||invoke.success!==true||!emptyErrors(invoke.errors))fail('FORGE_OUTER_REFUSAL');
 const body=invoke.response?.body;
 if(!body||typeof body!=='object'||body.success!==true)fail('FORGE_BODY_REFUSAL');
 return body;
};
async function drain(){while(pending.size)await Promise.allSettled([...pending]);check();}
function track(promise:Promise<any>){pending.add(promise);promise.catch(()=>{stopped=true;}).finally(()=>pending.delete(promise));}
async function readHttp(kind:string,label:string,url:string,options:any,cost:number){
 return budget.run(label,cost,async()=>{
  check();const rec:any={kind,label,startedAt:new Date().toISOString()};receipt.reads.push(rec);persist();
  try{const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(60000)}),raw=await response.text();
   rec.httpStatus=response.status;rec.finishedAt=new Date().toISOString();rec.responseSha256=sha(raw);rec.responseBytes=Buffer.byteLength(raw);
   // Plain hooks/Jira carry no returned Forge credentials. Refuse credential-shaped output before saving it.
   if(/(?:"contextToken"|"authorization"|"set-cookie"|eyJ[A-Za-z0-9_-]+\.eyJ)/i.test(raw))fail('UNEXPECTED_CREDENTIAL_SHAPE');
   try{rec.body=JSON.parse(raw);}catch{rec.unparsedResponseSha256=sha(raw);persist();fail('MALFORMED_JSON');}
   persist();if(response.status!==200)fail('HTTP_REFUSAL');if(rec.body?.success===false||rec.body?.error||!emptyErrors(rec.body?.errors))fail('READ_BODY_REFUSAL');return rec.body;
  }catch(error){rec.failed=true;rec.errorSha256=sha(String(error));rec.finishedAt=new Date().toISOString();persist();stopped=true;throw new Error('READ_FAILED');}
 });
}
async function rpc(key:string,payload:any={},cost=64){admit(key,payload);return budget.run(key+(payload.planId?':'+payload.planId:''),cost,async()=>{
 check();assert.ok(wire,'WIRE_MISSING');const fresh=assertCapacityWireFresh(wire,{tokenOf:w=>w.data.variables.input.payload.contextToken});
 const data=structuredClone(wire.data);data.variables.input.payload.call={functionKey:key,payload};const headers=replayHeaders(wire.headers);
 const rec:any={kind:'rpc',functionKey:key,payload,startedAt:new Date().toISOString(),fresh};receipt.reads.push(rec);persist();
 try{const response=await context.request.post(wire.url,{headers,data:JSON.stringify(data),maxRetries:0,maxRedirects:0,timeout:60000});
  rec.httpStatus=response.status();const record=serializeForgeResponse(await response.text(),{requestToken:data.variables.input.payload.contextToken,requestHeaders:headers});
  const {data:parsed,...retained}=record;Object.assign(rec,retained,{finishedAt:new Date().toISOString()});persist();if(rec.httpStatus!==200)fail('RPC_HTTP_REFUSAL');const body=responseBody(record);rec.body=body;persist();return body;
 }catch(error){rec.failed=true;rec.errorSha256=sha(String(error));persist();stopped=true;throw new Error('RPC_READ_FAILED');}
 });}
async function main(){
 assert.equal(process.env.LZ_USER_UAT_BASELINE,'readonly');assert.ok(fs.existsSync(directory));fs.mkdirSync(privateDirectory,{mode:0o700});persist();loadEnv();
 const hook=async(what:string,payload:any={},cost=64)=>{
  assert.ok(['plans','fieldConfig','plan'].includes(what));if(what==='plan')assert.ok(ids.includes(payload.planId));
  const url=new URL(process.env.LZ_PPM_TESTHOOK_URL!);url.searchParams.set('what',what);for(const[k,v]of Object.entries(payload))url.searchParams.set(k,String(v));
  return readHttp('hook',what+(payload.planId?':'+payload.planId:''),String(url),{headers:{Authorization:'Bearer '+process.env.HARNESS_SECRET}},cost);
 };
 const monitor=async(ctx:any,expected:any)=>{
  await ctx.route('**/gateway/api/graphql**',async(route:any)=>{const data=parseRequest(route.request()),input=data?.variables?.input;if(input?.extensionId!==extension)return route.continue();
   try{check();admit(input.payload.call.functionKey,input.payload.call.payload??{},true);await route.continue();}catch{stopped=true;receipt.uiRefusal='UNRECOGNIZED_OR_BLOCKED_UI_READ';persist();await route.abort();}
  });
  ctx.on('response',(response:any)=>{const request=response.request(),data=parseRequest(request),input=data?.variables?.input;if(input?.extensionId!==extension)return;
   track((async()=>{const rec:any={functionKey:input.payload.call.functionKey,startedAt:new Date().toISOString(),httpStatus:response.status()};receipt.ui.push(rec);persist();
    try{await response.finished();const headers=await request.allHeaders(),record=serializeForgeResponse(await response.text(),{requestToken:input.payload.contextToken,requestHeaders:headers});const {data:parsed,...retained}=record;Object.assign(rec,retained,{finishedAt:new Date().toISOString()});persist();if(response.status()!==200)fail('UI_HTTP_REFUSAL');responseBody(record);
     if(input.payload.call.functionKey==='getCapacitySettings')wire={url:request.url(),data,headers};
    }catch(error){rec.failed=true;rec.errorSha256=sha(String(error));persist();stopped=true;}
   })());
  });
  ctx.on('requestfailed',(request:any)=>{const input=parseRequest(request)?.variables?.input;if(input?.extensionId===extension){stopped=true;receipt.uiTransportFailure={functionKey:input.payload.call.functionKey,errorSha256:sha(JSON.stringify(request.failure()))};persist();}});
  await verifyPortableIdentity(ctx,expected);await drain();
 };
 try{
  context=await createPortableLauncher({chromium,installHostFlagSuppressor,verifyIdentity:monitor})({mode:'portable-chrome152',headed:false,viewport:{width:1600,height:1100},expected:{accountId:account,uiVersion:'4.58.589'},observeClose:(phase:string,event:string)=>{closePhases.push({phase,event,at:new Date().toISOString()});fs.writeFileSync(path.join(directory,'close-phases.json'),JSON.stringify(closePhases,null,2));}});
  receipt.launch=getPortableReceipt(context);persist();page=await context.newPage();await page.goto(APP_URL,{waitUntil:'domcontentloaded',timeout:45000});const element=page.locator('iframe[data-testid="hosted-resources-iframe"]').first();await element.waitFor({state:'attached'});const frame=await(await element.elementHandle())!.contentFrame();assert.ok(frame);await frame.getByRole('heading',{name:'Plans',exact:true}).waitFor();await drain();await frame.getByRole('button',{name:'Capacity',exact:true}).click();
  const until=Date.now()+45000;while(!wire&&Date.now()<until){check();await new Promise(r=>setTimeout(r,100));}await drain();assert.ok(wire,'CAPACITY_WIRE_MISSING');await page.goto('about:blank');await drain();receipt.parkedAt=new Date().toISOString();persist();
  // Initial UI admission reads are separate from the budgeted baseline window.
  console.log('BASELINE parked; 61-second quiet interval');await new Promise(r=>setTimeout(r,61000));check();
  const registry=await hook('plans'),fields=await hook('fieldConfig');receipt.registryBefore=summary(registry);receipt.fieldConfig=fields;receipt.settings=await rpc('getCapacitySettings');persist();
  const before:any={};
  for(const planId of ids){before[planId]={plan:await rpc('getPlan',{planId}),draft:await rpc('getDraft',{planId})};await rpc('getActiveDrafts',{planId});await rpc('getLockStatus',{planId});}
  const sources:any={};
  for(const planId of ids){const count=before[planId].plan.plan.shardCount;assert.ok(Number.isSafeInteger(count)&&count>=0&&count<=118,'SOURCE_READ_BUDGET_UNBOUNDED');
   console.log('BASELINE source '+planId);const source=await hook('plan',{planId},25*(count+2));assert.ok(source.meta?.id===planId&&Array.isArray(source.issues));sources[planId]=source;
   const file=path.join(privateDirectory,planId+'.json'),raw=JSON.stringify(source);fs.writeFileSync(file,raw,{mode:0o600});const dates:any={};
   for(const field of ['startDate','dueDate']){const values=source.issues.map((r:any)=>r[field]),valid=values.filter((v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)).sort();dates[field]={min:valid[0]??null,max:valid.at(-1)??null,dated:valid.length,nullish:values.filter((v:any)=>v==null).length};}
   receipt.sources.push({planId,file,...summary(source),issuesBytes:summary(source.issues).bytes,issueCount:source.issues.length,uniqueKeys:new Set(source.issues.map((r:any)=>r.key)).size,meta:source.meta,dates,ownDraft:summary(before[planId].draft.draft)});persist();
  }
  const fieldValues=Object.values(fields.fields??{}).filter(v=>typeof v==='string'&&/^(customfield_\d+|duedate|timeoriginalestimate)$/.test(v as string));
  const jiraFields=[...new Set(['summary','status','project','customfield_10015','duedate',...fieldValues])].join(',');
  const keys=new Set<string>();for(const id of ids){const rows=sources[id].issues;if(rows.length){keys.add(rows[0].key);keys.add(rows.at(-1).key);}}for(const k of ['LZPP-1999','LZPP-2000'])if(sources[ids[0]].issues.some((r:any)=>r.key===k))keys.add(k);
  for(const key of keys){check();const uri='https://wolfaenpak.atlassian.net/rest/api/3/issue/'+encodeURIComponent(key)+'?fields='+jiraFields;const auth='Basic '+Buffer.from(process.env.JIRA_ADMIN_EMAIL+':'+process.env.JIRA_API_TOKEN).toString('base64');await readHttp('jira',key,uri,{headers:{Authorization:auth,Accept:'application/json'}},1);}
  // Catalog discovery is bounded but potentially much more expensive than ordinary metadata.
  for(const planId of ids){console.log('BASELINE report status '+planId);await rpc('getSponsorReportCapture',{planId},768);console.log('BASELINE first catalog page '+planId);await rpc('listSponsorReports',{planId},2560);}
  receipt.bookends={};for(const planId of ids){const end={plan:await rpc('getPlan',{planId}),draft:await rpc('getDraft',{planId})};receipt.bookends[planId]={before:summary(before[planId]),after:summary(end),unchanged:JSON.stringify(before[planId])===JSON.stringify(end)};}
  const registryAfter=await hook('plans');receipt.registryAfter=summary(registryAfter);receipt.registryUnchanged=JSON.stringify(registry)===JSON.stringify(registryAfter);receipt.passed=true;persist();
 }catch(error){receipt.failure={errorSha256:sha(String(error)),stoppedAt:new Date().toISOString()};receipt.passed=false;persist();process.exitCode=1;}
 finally{budget.close();if(context)try{await context.close();receipt.browserClosed=true;}catch(error){receipt.closeFailureSha256=sha(String(error));receipt.passed=false;process.exitCode=1;}receipt.finishedAt=new Date().toISOString();persist();}
}
await main();
