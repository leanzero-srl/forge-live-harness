# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-large-history.spec.ts >> large history and report: existing >2000 Jira issues retain every captured field, complete HTML and terminal rows without mutating the source
- Location: scenarios/lz-ppm/journey-campaign-large-history.spec.ts:13:1

# Error details

```
Error: expect(received).toBeTruthy()

Received: undefined
```

# Test source

```ts
  1  | import {waitForAppReady} from './settled-screenshot.mjs';
  2  | import {replayHeaders} from './replay-headers.mjs';
  3  | import {gunzipSync} from 'node:zlib';
  4  | import {expect} from '../../fixtures/forge';
  5  | export function callEnvelope(req:any) {
  6  |   try {let raw=req.postDataBuffer();if(!raw)return null;if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString());}catch{return null;}
  7  | }
  8  | export const callOf=(req:any)=>callEnvelope(req)?.variables?.input?.payload?.call;
  9  | export const bodyOf=async(res:any)=>(await res.json()).data?.invokeExtension?.response?.body;
  10 | /** Actual transport/body observation; callers must explicitly grade success or
  11 |  * one named expected refusal. This does not retry or modify backend responses. */
  12 | export function observedResponse(page:any,functionKey:string,planId?:string) {
  13 |  return page.waitForResponse((r:any)=>{const c=callOf(r.request());return c?.functionKey===functionKey&&(!planId||c.payload?.planId===planId);},{timeout:120000})
> 14 |   .then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const b=await bodyOf(r);expect(b).toBeTruthy();return b;});
     |                                                                                                          ^ Error: expect(received).toBeTruthy()
  15 | }
  16 | export function actualResponse(page:any,functionKey:string,planId?:string) {
  17 |  return observedResponse(page,functionKey,planId).then((b:any)=>{expect(b.success,`${functionKey}: ${b.error||'unspecified failure'}`).toBe(true);return b;});
  18 | }
  19 | /** Capture only an actual current-user request. Secrets remain memory-only. */
  20 | export function currentUserResolver(page:any,filter:(call:any)=>boolean) {
  21 |   let wire:any;
  22 |   const capture=(req:any)=>{const data=callEnvelope(req);if(filter(data?.variables?.input?.payload?.call))wire={url:req.url(),data,headers:req.allHeaders()};};
  23 |   page.on('request',capture);
  24 |   return {
  25 |     stop:()=>page.off('request',capture),
  26 |     invoke:async(functionKey:string,payload:any={})=>{
  27 |       expect(wire,'actual authenticated resolver request observed in this journey').toBeTruthy();
  28 |       const data=structuredClone(wire.data);data.variables.input.payload.call={functionKey,payload};
  29 |       const headers=replayHeaders(await wire.headers);
  30 |       const res=await page.request.post(wire.url,{headers,data:JSON.stringify(data)});expect(res.status()).toBe(200);const body=await bodyOf(res);expect(body).toBeTruthy();return body;
  31 |     },
  32 |   };
  33 | }
  34 | export async function planning(frame:any) {
  35 |   await frame.getByRole('button',{name:/^Planning/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  36 |   const workspace=frame.locator('[data-testid="planning-workspace"]');await waitForAppReady(workspace);return workspace;
  37 | }
  38 | export async function chooseDate(frame:any,within:any,label:string,iso:string) {
  39 |   await within.getByRole('button',{name:label,exact:true}).click();const cal=frame.locator('.lz-datepicker');
  40 |   const[y,m]=iso.split('-').map(Number),months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  41 |   for(let n=0;n<30;n++){const title=(await cal.locator('span').first().textContent()).trim();if(title===`${months[m-1]} ${y}`)break;const[month,year]=title.split(' ');await cal.getByRole('button',{name:Number(year)*12+months.indexOf(month)<y*12+m-1?'Next month':'Previous month',exact:true}).click();}
  42 |   await expect(cal.locator('span').first()).toHaveText(`${months[m-1]} ${y}`);await cal.getByRole('button',{name:iso,exact:true}).click();await expect(cal).toHaveCount(0);
  43 | }
  44 | 
```