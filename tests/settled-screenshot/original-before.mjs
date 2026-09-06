import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');

// A nonblank PNG is necessary evidence, never sufficient feature acceptance.
// Semantic field assertions and human inspection remain separate obligations.
export function pngContent(buffer){
 const {width,height,data}=PNG.sync.read(buffer),colors=new Map();
 for(let i=0;i<data.length;i+=4){const color=`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`;colors.set(color,(colors.get(color)||0)+1);}
 let dominant=0;for(const count of colors.values())dominant=Math.max(dominant,count);const different=width*height-dominant;
 return {width,height,colors:colors.size,differentPixels:different,nonblank:colors.size>=16&&different>=Math.max(100,width*height*.002)};
}
// This predicate is also checked immediately after capture: waiting afterwards
// could accept a loading overlay that disappeared only after the image was made.
async function painted(subject) {
 return subject.evaluate(el=>{
  for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(p.hasAttribute('inert')||Number(s.opacity)<.99||s.visibility!=='visible'||s.display==='none')return false;}
  // Indexing uses a sibling overlay, unlike the inert draft/adoption boundary.
  // Only a screenshot intentionally targeting that overlay may show it.
  for(const overlay of el.ownerDocument.querySelectorAll('[data-testid="tab-loading-overlay"]')){
   if(overlay.contains(el))continue;
   const r=overlay.getBoundingClientRect();let visible=r.width>0&&r.height>0;
   for(let p=overlay;p;p=p.parentElement){const style=getComputedStyle(p);if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)visible=false;}
   if(visible)return false;
  }
  if(el.ownerDocument.getAnimations().some(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime)))return false;
  const r=el.getBoundingClientRect();return r.width>0&&r.height>0;
 });
}
export async function waitForAppReady(subject) {
 await expect(subject).toBeVisible();
 await expect.poll(()=>painted(subject),{timeout:30000,message:'intended app subject is painted and outside every inert loading/adoption boundary'}).toBe(true);
}
export async function settledScreenshot(target,options) {
 const {subject:specifiedSubject,...shotOptions}=options;
 const isPage=typeof target.context==='function';
 assert.ok(!isPage||specifiedSubject,'Page screenshots require an explicit intended subject; host chrome cannot prove app readiness');
 const subject=specifiedSubject||target;
 await waitForAppReady(subject);await subject.scrollIntoViewIfNeeded();
 await subject.evaluate(el=>new Promise(resolve=>el.ownerDocument.defaultView.requestAnimationFrame(()=>el.ownerDocument.defaultView.requestAnimationFrame(resolve))));
 assert.equal(await painted(subject),true,'Screenshot subject became blocked before capture');
 const buffer=await target.screenshot({...shotOptions,animations:'disabled'}),content=pngContent(buffer);
 assert.equal(await painted(subject),true,`Screenshot subject became blocked during capture: ${options.path}`);
 assert.equal(content.nonblank,true,`Blank screenshot rejected: ${options.path} ${JSON.stringify(content)}`);
 return content;
}
