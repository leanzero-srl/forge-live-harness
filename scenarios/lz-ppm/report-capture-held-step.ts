import {callOf} from './campaign-ui';

/** Hold delivery of one actual backend response, never its content or execution. */
export async function holdFirstReportAdvance(page:any,planId:string,onEvidence:(event:any)=>void,when=(body:any)=>true) {
 let release!:()=>void,resolve!: (value:any)=>void,reject!:(error:any)=>void,used=false;
 const released=new Promise<void>(r=>{release=r;});
 const ready=new Promise<any>((r,j)=>{resolve=r;reject=j;});ready.catch(()=>{});
 const pattern='**/gateway/api/graphql**';
 const active=new Set<Promise<any>>();
 const handle=async(route:any)=>{
  const call=callOf(route.request());
  if(used||call?.functionKey!=='advanceSponsorReportCapture'||call.payload?.planId!==planId){await route.continue();return;}
  try{
   const response=await route.fetch(),outer=await response.json(),body=outer?.data?.invokeExtension?.response?.body;
   if(!when(body)){await route.fulfill({response});return;}used=true;
   onEvidence({stage:'holding-real-advance-response',time:new Date().toISOString(),request:call.payload});
   onEvidence({stage:'real-advance-response-ready',time:new Date().toISOString(),httpStatus:response.status(),body,errors:outer?.data?.invokeExtension?.errors||outer?.errors||null});
   resolve({call,responseStatus:response.status(),body});await released;await route.fulfill({response});
   onEvidence({stage:'real-advance-response-delivered',time:new Date().toISOString()});
  }catch(error){reject(error);throw error;}
 };
 const handler=(route:any)=>{const task=handle(route);active.add(task);task.finally(()=>active.delete(task)).catch(()=>{});return task;};
 await page.route(pattern,handler);
 return {ready,release,stop:async()=>{release();await page.unroute(pattern,handler);const ended=await Promise.allSettled([...active]);const errors=ended.filter((r:any)=>r.status==='rejected').map((r:any)=>r.reason);if(errors.length)throw new AggregateError(errors,'Held actual report response delivery failed');}};
}

export async function awaitHeldReportStep(held:any,timeoutMs:number){
 let timer:any;try{return await Promise.race([held.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`No selected actual report step within ${timeoutMs}ms`)),timeoutMs);})]);}finally{clearTimeout(timer);}
}
