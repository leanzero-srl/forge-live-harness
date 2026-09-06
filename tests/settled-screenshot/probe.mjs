import {chromium} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {settledScreenshot as old} from './original-before.mjs';
import {settledScreenshot as fixed} from '../../scenarios/lz-ppm/settled-screenshot.mjs';
const out=path.resolve('tests/settled-screenshot/evidence');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
const fixture='<html><body style="margin:0;background:#14253d;color:white;font:24px sans-serif"><main id="subject" style="height:400px;padding:20px"><h1>Actual settled subject</h1><p>Expected complete value: 20h / 12h</p><div style="background:#1e53ec;padding:20px">Ready result α ✓</div></main></body></html>';
const overlay=async(page,remove=120)=>page.evaluate(ms=>{let x=document.createElement('div');x.dataset.testid='tab-loading-overlay';x.id='blocker';x.style='position:fixed;inset:0;background:#be123c';x.textContent='Loading';document.body.append(x);if(ms)setTimeout(()=>x.remove(),ms);},remove);
async function run(name,fn,kind){
 const context=await browser.newContext({viewport:{width:640,height:480}});const page=await context.newPage();await page.setContent(fixture);const loc=page.locator('#subject');let scrolls=0,shots=0;const sentinel=new Error('actual capture boundary failure');
 const subject=new Proxy(loc,{get(t,k){if(k==='scrollIntoViewIfNeeded')return async()=>{await t.scrollIntoViewIfNeeded();scrolls++;if(kind==='pre'&&scrolls===1||kind==='permanent')await overlay(page,120);};const v=t[k];return typeof v==='function'?v.bind(t):v;}});
 const target=new Proxy(page,{get(t,k){if(k==='screenshot')return async options=>{shots++;if(kind==='throw')throw sentinel;const b=await t.screenshot(options);if(kind==='post'&&shots===1)await overlay(page,120);return b;};const v=t[k];return typeof v==='function'?v.bind(t):v;}});
 if(kind==='blank')await page.setContent('<html><body style="margin:0;background:white"><main id="subject" style="width:640px;height:480px"></main></body></html>');
 const file=path.join(out,`${name}.png`);let error,result;
 try{result=await fn(target,{subject,path:file,stabilityTimeout:600});}catch(e){error=e;}
 const audit=fs.existsSync(file+'.capture.json')?JSON.parse(fs.readFileSync(file+'.capture.json','utf8')):null;
 results.push({name,kind,scrolls,shots,accepted:!!result,error:error?.message,published:fs.existsSync(file),audit,sentinelPreserved:kind==='throw'?error===sentinel:undefined});await context.close();return results.at(-1);
}
try{
 for(const kind of ['pre','post']){
  const red=await run('original-'+kind,old,kind);assert.equal(red.accepted,false);assert.match(red.error,/became blocked/);
  const green=await run('fixed-'+kind,fixed,kind);assert.equal(green.accepted,true);assert.equal(green.audit.accepted,true);assert.deepEqual(green.audit.attempts.map(x=>x.state),[kind==='pre'?'rejected-before-capture':'rejected-during-capture','accepted']);
 }
 const permanent=await run('fixed-permanent',fixed,'permanent');assert.equal(permanent.accepted,false);assert.equal(permanent.published,false);
 const blank=await run('fixed-blank',fixed,'blank');assert.equal(blank.accepted,false);assert.equal(blank.published,false);assert.match(blank.error,/Blank screenshot rejected/);
 const thrown=await run('fixed-original-error',fixed,'throw');assert.equal(thrown.sentinelPreserved,true);assert.equal(thrown.shots,1);assert.equal(thrown.published,false);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({browserVersion:browser.version(),actualLocalDom:true,results,complete:true},null,2)+'\n');console.log(JSON.stringify({complete:true,cases:results.length,output:out}));
}finally{fs.writeFileSync(path.join(out,'partial.json'),JSON.stringify(results,null,2));await browser.close();}
