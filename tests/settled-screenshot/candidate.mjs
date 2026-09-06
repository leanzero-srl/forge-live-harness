import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
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
export async function waitForAppReady(subject,{timeout=30000}={}) {
 const deadline=performance.now()+timeout;
 await expect(subject).toBeVisible({timeout});
 await expect.poll(()=>painted(subject),{timeout:Math.max(1,deadline-performance.now()),message:'intended app subject is painted and outside every inert loading/adoption boundary'}).toBe(true);
}
export async function settledScreenshot(target,options) {
 const {subject:specifiedSubject,stabilityTimeout=30000,path:outputPath,...shotOptions}=options;
 const isPage=typeof target.context==='function';
 assert.ok(!isPage||specifiedSubject,'Page screenshots require an explicit intended subject; host chrome cannot prove app readiness');
 assert.ok(Number.isFinite(stabilityTimeout)&&stabilityTimeout>0,'Positive screenshot stability deadline required');
 const subject=specifiedSubject||target,deadline=performance.now()+stabilityTimeout;
 const audit={accepted:false,attempts:[]};let originalError;
 const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
 const remaining=()=>{const ms=deadline-performance.now();if(ms<=0)throw new Error(`Screenshot stability deadline exceeded: ${outputPath}`);return ms;};
 // Bound every browser operation; a late buffer cannot reach publication.
 // Race rejection is observed even if an underlying protocol operation finishes later.
 const within=async(operation)=>{let timer;const ms=remaining();try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Screenshot stability deadline exceeded: ${outputPath}`)),ms);})]);}finally{clearTimeout(timer);}};
 try {
  if(outputPath&&fs.existsSync(outputPath)){
   audit.previousImage=`${outputPath}.previous-${randomUUID()}.png`;
   fs.renameSync(outputPath,audit.previousImage);
  }
  while(performance.now()<deadline) {
   const attempt={number:audit.attempts.length+1,startedAt:new Date().toISOString(),state:'waiting'};audit.attempts.push(attempt);
   await within(()=>waitForAppReady(subject,{timeout:remaining()}));
   await within(()=>subject.scrollIntoViewIfNeeded({timeout:remaining()}));
   await within(()=>subject.evaluate(el=>new Promise(resolve=>el.ownerDocument.defaultView.requestAnimationFrame(()=>el.ownerDocument.defaultView.requestAnimationFrame(resolve)))));
   if(!await within(()=>painted(subject))){attempt.state='rejected-before-capture';continue;}
   // Publish only after both readiness observations accept this exact buffer.
   const buffer=await within(()=>target.screenshot({...shotOptions,timeout:Math.min(shotOptions.timeout>0?shotOptions.timeout:Infinity,remaining()),animations:'disabled'}));
   if(!await within(()=>painted(subject))){
    attempt.state='rejected-during-capture';
    if(outputPath){attempt.rejectedImage=`${outputPath}.rejected-${attempt.number}.png`;write(attempt.rejectedImage,buffer);}
    continue;
   }
   const content=pngContent(buffer);attempt.content=content;
   assert.equal(content.nonblank,true,`Blank screenshot rejected: ${outputPath} ${JSON.stringify(content)}`);
   remaining();
   if(outputPath)write(outputPath,buffer);
   attempt.state='accepted';audit.accepted=true;return content;
  }
  throw new Error(`Screenshot subject did not remain ready within ${stabilityTimeout}ms: ${outputPath}`);
 }catch(error){originalError=error;audit.error=String(error);throw error;}
 finally {
  if(outputPath)try{write(`${outputPath}.capture.json`,JSON.stringify(audit,null,2)+'\n');}
  catch(error){throw new AggregateError([...(originalError?[originalError]:[]),error],'Screenshot capture and audit-write errors');}
 }
}
