/** Charge UI requests through their actual terminal event, never just route.continue dispatch. */
export async function continueUntilFinished(page,route,{timeout=60000,onObserved=(_value)=>{}}={}){
 const request=route.request();let finished,failed,timer;
 const terminal=new Promise((resolve,reject)=>{finished=r=>{if(r===request)resolve({state:'finished'});};failed=r=>{if(r===request)resolve({state:'failed',error:r.failure()?.errorText??'unknown transport error'});};page.on('requestfinished',finished);page.on('requestfailed',failed);timer=setTimeout(()=>reject(new Error('UI request completion remained unknown after bounded60s transport observation')),timeout);});
 terminal.catch(()=>{});
 try{await route.continue();const result=await terminal;await onObserved(result);return result;}finally{clearTimeout(timer);page.off('requestfinished',finished);page.off('requestfailed',failed);}
}
