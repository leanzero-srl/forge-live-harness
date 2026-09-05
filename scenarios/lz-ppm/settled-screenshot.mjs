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
export async function settledScreenshot(target,options){
 const isPage=typeof target.context==='function',element=isPage?target.locator('body'):target;
 await expect(element).toBeVisible();if(!isPage)await element.scrollIntoViewIfNeeded();
 await expect.poll(()=>element.evaluate(el=>{
  for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(Number(s.opacity)<.99||s.visibility!=='visible'||s.display==='none')return false;}
  const r=el.getBoundingClientRect();return r.width>0&&r.height>0;
 }),{timeout:15000,message:'screenshot subject and all ancestors are fully painted'}).toBe(true);
 await element.evaluate(el=>new Promise(resolve=>el.ownerDocument.defaultView.requestAnimationFrame(()=>el.ownerDocument.defaultView.requestAnimationFrame(resolve))));
 const buffer=await target.screenshot({...options,animations:'disabled'}),content=pngContent(buffer);
 assert.equal(content.nonblank,true,`Blank screenshot rejected: ${options.path} ${JSON.stringify(content)}`);
 return content;
}
