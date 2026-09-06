import {observeCall} from './report-throughput-observer.mjs';
import {waitForAppReady} from './settled-screenshot.mjs';
import {replayHeaders} from './replay-headers.mjs';
import {gunzipSync} from 'node:zlib';
import {expect} from '../../fixtures/forge';
export function callEnvelope(req:any) {
  try {let raw=req.postDataBuffer();if(!raw)return null;if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString());}catch{return null;}
}
export const callOf=(req:any)=>callEnvelope(req)?.variables?.input?.payload?.call;
export const bodyOf=async(res:any)=>(await res.json()).data?.invokeExtension?.response?.body;
/** Actual transport/body observation; callers must explicitly grade success or
 * one named expected refusal. This does not retry or modify backend responses. */
export function observedResponse(page:any,functionKey:string,planId?:string) {
 return page.waitForResponse((r:any)=>{const c=callOf(r.request());return c?.functionKey===functionKey&&(!planId||c.payload?.planId===planId);},{timeout:120000})
  .then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const b=await bodyOf(r);expect(b).toBeTruthy();return b;});
}
export function actualResponse(page:any,functionKey:string,planId?:string) {
 return observedResponse(page,functionKey,planId).then((b:any)=>{expect(b.success,`${functionKey}: ${b.error||'unspecified failure'}`).toBe(true);return b;});
}
/** Capture only an actual current-user request. Secrets remain memory-only. */
export function currentUserResolver(page:any,filter:(call:any)=>boolean,{observer=null}:any={}) {
  let wire:any;
  const capture=(req:any)=>{const data=callEnvelope(req);if(filter(data?.variables?.input?.payload?.call))wire={url:req.url(),data,headers:req.allHeaders()};};
  page.on('request',capture);
  return {
    stop:()=>page.off('request',capture),
    invoke:async(functionKey:string,payload:any={})=>{
      expect(wire,'actual authenticated resolver request observed in this journey').toBeTruthy();
      const data=structuredClone(wire.data);data.variables.input.payload.call={functionKey,payload};
      const headers=replayHeaders(await wire.headers);
      if(!observer){const res=await page.request.post(wire.url,{headers,data:JSON.stringify(data)});expect(res.status()).toBe(200);const body=await bodyOf(res);expect(body).toBeTruthy();return body;}
      const observed=observeCall(observer,'beginExternal','rpc',functionKey,payload);let failed=false,cause:any;
      try{const res=await page.request.post(wire.url,{headers,data:JSON.stringify(data)});observeCall(observer,'externalResponse',observed,res,{requestToken:data.variables.input.payload.contextToken,requestHeaders:headers});expect(res.status()).toBe(200);const body=await bodyOf(res);expect(body).toBeTruthy();return body;}
      catch(error){failed=true;cause=error;throw error;}finally{observeCall(observer,'endExternal',observed,cause,failed);}
    },
  };
}
export async function planning(frame:any) {
  await frame.getByRole('button',{name:/^Planning/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  const workspace=frame.locator('[data-testid="planning-workspace"]');await waitForAppReady(workspace);return workspace;
}
export async function chooseDate(frame:any,within:any,label:string,iso:string) {
  await within.getByRole('button',{name:label,exact:true}).click();const cal=frame.locator('.lz-datepicker');
  const[y,m]=iso.split('-').map(Number),months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  for(let n=0;n<30;n++){const title=(await cal.locator('span').first().textContent()).trim();if(title===`${months[m-1]} ${y}`)break;const[month,year]=title.split(' ');await cal.getByRole('button',{name:Number(year)*12+months.indexOf(month)<y*12+m-1?'Next month':'Previous month',exact:true}).click();}
  await expect(cal.locator('span').first()).toHaveText(`${months[m-1]} ${y}`);await cal.getByRole('button',{name:iso,exact:true}).click();await expect(cal).toHaveCount(0);
}
