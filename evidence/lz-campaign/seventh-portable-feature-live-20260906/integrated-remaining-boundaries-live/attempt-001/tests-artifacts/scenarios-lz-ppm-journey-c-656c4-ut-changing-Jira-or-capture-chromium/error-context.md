# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-simulation.spec.ts >> private simulation: scope, holiday and lag survive model save/reopen; excluded task can return without changing Jira or capture
- Location: scenarios/lz-ppm/journey-campaign-simulation.spec.ts:42:1

# Error details

```
AssertionError: Screenshot subject became blocked before capture

false !== true

```

# Test source

```ts
  1  | import {createRequire} from 'node:module';
  2  | import assert from 'node:assert/strict';
  3  | import {expect} from '@playwright/test';
  4  | const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
  5  | 
  6  | // A nonblank PNG is necessary evidence, never sufficient feature acceptance.
  7  | // Semantic field assertions and human inspection remain separate obligations.
  8  | export function pngContent(buffer){
  9  |  const {width,height,data}=PNG.sync.read(buffer),colors=new Map();
  10 |  for(let i=0;i<data.length;i+=4){const color=`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`;colors.set(color,(colors.get(color)||0)+1);}
  11 |  let dominant=0;for(const count of colors.values())dominant=Math.max(dominant,count);const different=width*height-dominant;
  12 |  return {width,height,colors:colors.size,differentPixels:different,nonblank:colors.size>=16&&different>=Math.max(100,width*height*.002)};
  13 | }
  14 | // This predicate is also checked immediately after capture: waiting afterwards
  15 | // could accept a loading overlay that disappeared only after the image was made.
  16 | async function painted(subject) {
  17 |  return subject.evaluate(el=>{
  18 |   for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(p.hasAttribute('inert')||Number(s.opacity)<.99||s.visibility!=='visible'||s.display==='none')return false;}
  19 |   // Indexing uses a sibling overlay, unlike the inert draft/adoption boundary.
  20 |   // Only a screenshot intentionally targeting that overlay may show it.
  21 |   for(const overlay of el.ownerDocument.querySelectorAll('[data-testid="tab-loading-overlay"]')){
  22 |    if(overlay.contains(el))continue;
  23 |    const r=overlay.getBoundingClientRect();let visible=r.width>0&&r.height>0;
  24 |    for(let p=overlay;p;p=p.parentElement){const style=getComputedStyle(p);if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)visible=false;}
  25 |    if(visible)return false;
  26 |   }
  27 |   if(el.ownerDocument.getAnimations().some(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime)))return false;
  28 |   const r=el.getBoundingClientRect();return r.width>0&&r.height>0;
  29 |  });
  30 | }
  31 | export async function waitForAppReady(subject) {
  32 |  await expect(subject).toBeVisible();
  33 |  await expect.poll(()=>painted(subject),{timeout:30000,message:'intended app subject is painted and outside every inert loading/adoption boundary'}).toBe(true);
  34 | }
  35 | export async function settledScreenshot(target,options) {
  36 |  const {subject:specifiedSubject,...shotOptions}=options;
  37 |  const isPage=typeof target.context==='function';
  38 |  assert.ok(!isPage||specifiedSubject,'Page screenshots require an explicit intended subject; host chrome cannot prove app readiness');
  39 |  const subject=specifiedSubject||target;
  40 |  await waitForAppReady(subject);await subject.scrollIntoViewIfNeeded();
  41 |  await subject.evaluate(el=>new Promise(resolve=>el.ownerDocument.defaultView.requestAnimationFrame(()=>el.ownerDocument.defaultView.requestAnimationFrame(resolve))));
> 42 |  assert.equal(await painted(subject),true,'Screenshot subject became blocked before capture');
     |         ^ AssertionError: Screenshot subject became blocked before capture
  43 |  const buffer=await target.screenshot({...shotOptions,animations:'disabled'}),content=pngContent(buffer);
  44 |  assert.equal(await painted(subject),true,`Screenshot subject became blocked during capture: ${options.path}`);
  45 |  assert.equal(content.nonblank,true,`Blank screenshot rejected: ${options.path} ${JSON.stringify(content)}`);
  46 |  return content;
  47 | }
  48 | 
```