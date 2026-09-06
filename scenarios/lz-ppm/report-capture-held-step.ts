import {callOf} from './campaign-ui';

/** Hold delivery of one actual backend response, never its content or execution. */
export async function holdFirstReportAdvance(page:any,planId:string,onEvidence:(event:any)=>void) {
 let release!:()=>void,resolve!: (value:any)=>void,reject!:(error:any)=>void,used=false;
 const released=new Promise<void>(r=>{release=r;});
 const ready=new Promise<any>((r,j)=>{resolve=r;reject=j;});ready.catch(()=>{});
 const pattern='**/gateway/api/graphql**';
 const handler=async(route:any)=>{
  const call=callOf(route.request());
  if(used||call?.functionKey!=='advanceSponsorReportCapture'||call.payload?.planId!==planId){await route.continue();return;}
  used=true;
  try{
   onEvidence({stage:'holding-real-advance-response',time:new Date().toISOString(),request:call.payload});
   const response=await route.fetch(),outer=await response.json(),body=outer?.data?.invokeExtension?.response?.body;
   onEvidence({stage:'real-advance-response-ready',time:new Date().toISOString(),httpStatus:response.status(),body,errors:outer?.data?.invokeExtension?.errors||outer?.errors||null});
   resolve({call,responseStatus:response.status(),body});await released;await route.fulfill({response});
   onEvidence({stage:'real-advance-response-delivered',time:new Date().toISOString()});
  }catch(error){reject(error);throw error;}
 };
 await page.route(pattern,handler);
 return {ready,release,stop:async()=>{release();await page.unroute(pattern,handler);}};
}
