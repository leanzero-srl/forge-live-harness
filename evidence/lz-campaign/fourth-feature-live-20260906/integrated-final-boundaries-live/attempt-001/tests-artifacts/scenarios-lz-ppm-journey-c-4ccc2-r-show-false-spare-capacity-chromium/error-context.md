# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-capacity-boundaries.spec.ts >> capacity boundaries: real missing and zero effort, custom-calendar partial week, unknown/zero availability and failed refresh never show false spare capacity
- Location: scenarios/lz-ppm/journey-campaign-capacity-boundaries.spec.ts:12:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1  | import {replayHeaders} from './replay-headers.mjs';
  2  | import {gunzipSync} from 'node:zlib';
  3  | import {expect} from '../../fixtures/forge';
  4  | export function callEnvelope(req:any) {
  5  |   try {let raw=req.postDataBuffer();if(!raw)return null;if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString());}catch{return null;}
  6  | }
  7  | export const callOf=(req:any)=>callEnvelope(req)?.variables?.input?.payload?.call;
  8  | export const bodyOf=async(res:any)=>(await res.json()).data?.invokeExtension?.response?.body;
  9  | export function actualResponse(page:any,functionKey:string,planId?:string) {
  10 |   return page.waitForResponse((r:any)=>{const c=callOf(r.request());return c?.functionKey===functionKey&&(!planId||c.payload?.planId===planId);},{timeout:120000})
> 11 |     .then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const b=await bodyOf(r);expect(b.success).toBe(true);return b;});
     |                                                                                                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  12 | }
  13 | /** Capture only an actual current-user request. Secrets remain memory-only. */
  14 | export function currentUserResolver(page:any,filter:(call:any)=>boolean) {
  15 |   let wire:any;
  16 |   const capture=(req:any)=>{const data=callEnvelope(req);if(filter(data?.variables?.input?.payload?.call))wire={url:req.url(),data,headers:req.allHeaders()};};
  17 |   page.on('request',capture);
  18 |   return {
  19 |     stop:()=>page.off('request',capture),
  20 |     invoke:async(functionKey:string,payload:any={})=>{
  21 |       expect(wire,'actual authenticated resolver request observed in this journey').toBeTruthy();
  22 |       const data=structuredClone(wire.data);data.variables.input.payload.call={functionKey,payload};
  23 |       const headers=replayHeaders(await wire.headers);
  24 |       const res=await page.request.post(wire.url,{headers,data:JSON.stringify(data)});expect(res.status()).toBe(200);const body=await bodyOf(res);expect(body).toBeTruthy();return body;
  25 |     },
  26 |   };
  27 | }
  28 | export async function planning(frame:any) {
  29 |   await frame.getByRole('button',{name:/^Planning/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  30 |   return frame.locator('[data-testid="planning-workspace"]');
  31 | }
  32 | export async function chooseDate(frame:any,within:any,label:string,iso:string) {
  33 |   await within.getByRole('button',{name:label,exact:true}).click();const cal=frame.locator('.lz-datepicker');
  34 |   const[y,m]=iso.split('-').map(Number),months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  35 |   for(let n=0;n<30;n++){const title=(await cal.locator('span').first().textContent()).trim();if(title===`${months[m-1]} ${y}`)break;const[month,year]=title.split(' ');await cal.getByRole('button',{name:Number(year)*12+months.indexOf(month)<y*12+m-1?'Next month':'Previous month',exact:true}).click();}
  36 |   await expect(cal.locator('span').first()).toHaveText(`${months[m-1]} ${y}`);await cal.getByRole('button',{name:iso,exact:true}).click();await expect(cal).toHaveCount(0);
  37 | }
  38 | 
```