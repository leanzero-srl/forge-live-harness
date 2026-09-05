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
  await page.setContent('<section style="width:500px;height:200px;background:#123abc"></section>');
  await assert.rejects(()=>settledScreenshot(page.locator('section'),{path:path.join(dir,'blank.png')}),/Blank screenshot rejected/);
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});
