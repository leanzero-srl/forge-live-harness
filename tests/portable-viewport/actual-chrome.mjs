import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {installPortableViewportSizing} from '../../forge/portable-viewport.mjs';
const require=createRequire(new URL('../../package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const out=await fs.mkdtemp(path.join(os.tmpdir(),'lz-portable-viewport-green-'));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check']});
assert.equal(browser.version(),'152.0.7977.76');
const result={version:browser.version(),out,cases:[]};
try{for(const video of [false,true])for(const width of [1100,1440,1600]){
 const name=`${width}-${video?'video':'trace'}`,dir=path.join(out,name);await fs.mkdir(dir);
 const context=await browser.newContext({viewport:{width:1440,height:900},...(video?{recordVideo:{dir,size:{width:1440,height:900}}}:{})});
 installPortableViewportSizing(context);
 await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:r.request().url().includes('127.0.0.1')?`<html><body style="margin:0"><button id="left" style="position:absolute;left:30px;top:272px;width:60px;height:32px">Left</button><button id="right" style="position:absolute;right:20px;top:272px;width:60px;height:32px">Right</button><button id="bottom" style="position:absolute;left:230px;bottom:47px;width:60px;height:32px">Bottom</button><script>window.clicks=[];document.addEventListener('click',e=>window.clicks.push({id:e.target.id,x:e.clientX,y:e.clientY}));</script></body></html>`:`<html><body style="margin:0"><iframe style="position:absolute;left:320px;top:48px;border:0;width:calc(100% - 320px);height:calc(100% - 48px)" src="http://127.0.0.1:43871/child"></iframe></body></html>`}));
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 const p=await context.newPage();await p.setViewportSize({width,height:1100});const row={name,stages:[]};result.cases.push(row);
 async function load(){await p.goto('http://localhost:43871/main');await p.frameLocator('iframe').locator('#right').waitFor();}
 async function stage(name){const f=p.frameLocator('iframe');await f.locator('body').evaluate(()=>window.clicks=[]);for(const id of ['left','right','bottom'])await f.locator('#'+id).click({timeout:3000});const clicks=await f.locator('body').evaluate(()=>window.clicks);assert.deepEqual(clicks.map(e=>e.id),['left','right','bottom']);const inner=await p.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.deepEqual(inner,{width,height:1100});assert.deepEqual(p.viewportSize(),inner);const cdp=await context.newCDPSession(p);const bounds=await cdp.send('Browser.getWindowForTarget'),metrics=await cdp.send('Page.getLayoutMetrics'),targets=await cdp.send('Target.getTargets');await cdp.detach();assert.equal(metrics.cssVisualViewport.clientWidth,width);assert.equal(metrics.cssVisualViewport.clientHeight,1100);assert.ok(targets.targetInfos.some(t=>t.type==='iframe'&&t.url.includes('127.0.0.1')),'actual cross-site renderer target');row.stages.push({name,clicks,inner,bounds});}
 try{await load();await stage('before');const doc=await context.newPage();await doc.goto('data:text/html,<html><body>Report</body></html>');await doc.pdf({path:path.join(dir,'doc.pdf'),landscape:true});await doc.close();await load();await stage('after-default-document-close');const editor=await context.newPage();await editor.setViewportSize({width,height:1100});await editor.goto('data:text/html,<html><body>Editor</body></html>');await editor.close();await load();await stage('after-matching-editor-close');const secondary=await context.newPage();await Promise.all([p.setViewportSize({width,height:1100}),secondary.close()]);await stage('after-concurrent-resize-close');console.log(JSON.stringify({name,stages:row.stages.map(s=>({name:s.name,events:s.clicks.length,inner:s.inner}))}));}finally{await context.tracing.stop({path:path.join(dir,'trace.zip')});await context.close();}
}}finally{await browser.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log('Evidence '+path.join(out,'result.json'));}
