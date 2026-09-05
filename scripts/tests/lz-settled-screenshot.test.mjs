import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {pngContent,settledScreenshot} from '../../scenarios/lz-ppm/settled-screenshot.mjs';
test('all three rejected live blanks fail content validation while inspected numeric report passes',()=>{
 const root='evidence/lz-campaign/third-feature-live-20260905/integrated-campaign-boundaries-live/attempt-001/tests-artifacts';
 for(const name of ['target-drift-unavailable.png','retained-completed-observation-receipt.png','sensitivity-parallel-ties.png','numeric-report-captured-overload.png']){
  const files=fs.readdirSync(root,{recursive:true}).filter(f=>f.endsWith('/'+name));assert.equal(files.length,1);
  assert.equal(pngContent(fs.readFileSync(path.join(root,files[0]))).nonblank,name==='numeric-report-captured-overload.png');
 }
});
test('real browser capture waits for a transparent ancestor to paint and rejects an empty box',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lz-shot-'));
 try{
  const page=await browser.newPage();await page.setContent('<div id="ancestor" style="opacity:0"><section style="width:500px;height:200px;background:#123abc;color:white"><h1>Actual result</h1><p>20 hours demand / 12 hours capacity</p></section></div>');
  await page.evaluate(()=>setTimeout(()=>document.querySelector('#ancestor').style.opacity='1',400));
  const result=await settledScreenshot(page.locator('section'),{path:path.join(dir,'result.png')});assert.equal(result.nonblank,true);
  const embedded='<style>@keyframes reveal {from{opacity:0}to{opacity:1}} section{animation:reveal .8s linear;width:400px;height:150px;background:#123abc;color:white}</style><section><h1>Rendered app outcome</h1></section>';
  await page.setContent(`<h1>Stable host chrome</h1><iframe data-testid="hosted-resources-iframe" srcdoc="${embedded.replaceAll('&','&amp;').replaceAll('"','&quot;')}"></iframe>`);await settledScreenshot(page,{subject:page.locator('iframe').contentFrame().locator('section'),path:path.join(dir,'embedded.png')});assert.equal(await page.locator('iframe').contentFrame().locator('section').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.setContent('<div style="height:5000px">Top</div><h1 id="last">Exact terminal row</h1>');await page.locator('#last').scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>window.scrollY);assert.ok(scroll>4000);await settledScreenshot(page,{subject:page.locator('#last'),path:path.join(dir,'terminal.png')});assert.equal(await page.evaluate(()=>window.scrollY),scroll);
  await page.setContent('<section style="width:500px;height:200px;background:#123abc"></section>');
  await assert.rejects(()=>settledScreenshot(page.locator('section'),{path:path.join(dir,'blank.png')}),/Blank screenshot rejected/);
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('real inert overlay cannot be accepted as feature evidence, while an intentional outer error can',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lz-inert-shot-'));
 try {
  const page=await browser.newPage();
  await page.setContent('<div role="alert" style="position:absolute;inset:0;background:#1543ac;color:white;z-index:2"><h1>Checking your saved draft</h1></div><main inert><section><h1>Exact JT-74 result</h1><p>Two native values and one visible task</p></section></main>');
  await assert.rejects(()=>settledScreenshot(page,{path:path.join(dir,'unspecified.png')}),/explicit intended subject/);
  await settledScreenshot(page,{subject:page.getByRole('alert'),path:path.join(dir,'intentional-blocked-alert.png')});
  await page.evaluate(()=>setTimeout(()=>{document.querySelector('main').removeAttribute('inert');document.querySelector('[role=alert]').remove();},450));
  await settledScreenshot(page,{subject:page.locator('section'),path:path.join(dir,'settled-result.png')});
  assert.equal(await page.locator('main').getAttribute('inert'),null);assert.equal(await page.getByRole('alert').count(),0);
  // Simulate a real mid-capture app reindex. The image is retained but rejected.
  const screenshot=page.screenshot.bind(page);page.screenshot=async options=>{await page.locator('main').evaluate(el=>el.setAttribute('inert',''));return screenshot(options);};
  await assert.rejects(()=>settledScreenshot(page,{subject:page.locator('section'),path:path.join(dir,'interrupted.png')}),/became blocked during capture/);
  assert.ok(fs.existsSync(path.join(dir,'interrupted.png')));
 }finally {await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});
