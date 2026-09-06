import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';import {execFileSync} from 'node:child_process';
import {createReportDocumentIdentity} from '../../scenarios/lz-ppm/report-document-identity.mjs';
const app='https://test.cdn.prod.atlassian-dev.net/app/env/build/ppm-ui/';
async function browserFixture(){
 const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();const page=await context.newPage(),events=[];
 await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:r.request().url().startsWith(app)?'<html><body><h1>Owned app</h1></body></html>':`<html><body><iframe data-testid="hosted-resources-iframe" src="${app}"></iframe></body></html>`}));
 const identity=createReportDocumentIdentity({page,appId:'app',envId:'env',record:(stage,value)=>events.push({stage,value}),timeoutMs:1000});
 await page.goto('https://host.invalid/');await page.locator('iframe').contentFrame().getByRole('heading').waitFor();
 return{page,identity,events,async close(){await identity.dispose();await context.close();await browser.close();}};
}
test('real host history.replaceState emits framenavigated while exact child document survives; archived handler rejects it',async()=>{
 const f=await browserFixture();try{
  const binding=f.identity.capture(19);assert.equal(await f.identity.current(binding),true);const before=f.identity.epoch;
  const old=execFileSync('git',['show','30df830:scenarios/lz-ppm/report-departure.ts'],{encoding:'utf8'});const expression=old.match(/const navigated=(\(frame:any\)=>\{[^\n]+\});/)[1].replace(':any','');const oldEpoch=new Function('page',`let lastBlank=0,nextId=20;const navigated=${expression};return {navigated,value:()=>lastBlank};`)(f.page);f.page.on('framenavigated',oldEpoch.navigated);
  await f.page.evaluate(()=>history.replaceState({},'',location.pathname+'#same-document'));
  assert.equal(oldEpoch.value(),20);assert.equal(f.identity.epoch,before);assert.equal(await f.identity.current(binding),true);
  if(process.env.LZ_OLD_DOCUMENT_EPOCH==='1')assert.equal(19>oldEpoch.value(),true,'Archived epoch must not reject a live owned child document');
  assert.ok(f.events.some(e=>e.stage==='report-document-navigation-observed'&&e.value.scope==='host'&&!e.value.invalidated));f.page.off('framenavigated',oldEpoch.navigated);
 }finally{await f.close();}
});
test('real child iframe replacement and literal main reload both reject old document witness',async()=>{
 for(const action of ['replace','reload']){const f=await browserFixture();try{const binding=f.identity.capture(19);assert.equal(await f.identity.current(binding),true);if(action==='replace')await f.page.evaluate(()=>{const old=document.querySelector('iframe'),next=old.cloneNode();old.replaceWith(next);});else await f.page.reload();await f.page.locator('iframe').contentFrame().getByRole('heading').waitFor();assert.equal(await f.identity.current(binding),false);const fresh=f.identity.capture(42);assert.equal(await f.identity.current(fresh),true);}finally{await f.close();}}
});
test('queued request-time acquisition cannot bind an old beat to replacement document',async()=>{
 const f=await browserFixture();try{const frame=f.page.frames().find(f.identity.matches),evaluate=frame.evaluateHandle.bind(frame);let release;const held=new Promise(r=>release=r);frame.evaluateHandle=async(...args)=>{await held;return evaluate(...args);};const old=f.identity.capture(19);await f.page.reload();await f.page.locator('iframe').contentFrame().getByRole('heading').waitFor();release();assert.equal(await f.identity.current(old),false);assert.equal(old.released,true);}finally{await f.close();}
});

test('real literal reload finishes before delayed app mount; adapter waits for positive list without replacing reload',async()=>{
 const [{default:ts},fs,{expect},{departOwnedPlan,armPresenceLeave},{serializeForgeResponse,ForgeResponseRecordError}]=await Promise.all([import('typescript'),import('node:fs'),import('@playwright/test'),import('../../scenarios/lz-ppm/owned-plan-departure.mjs'),import('../../scenarios/lz-ppm/forge-response-record.mjs')]);
 const file='scenarios/lz-ppm/report-departure.ts',source=process.env.LZ_OLD_REPORT_DEPARTURE==='1'?execFileSync('git',['show','30df830:'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
 const compiled=ts.transpileModule(source.replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const install=new Function('fs','expect','callEnvelope','getTarget','departOwnedPlan','armPresenceLeave','serializeForgeResponse','ForgeResponseRecordError','createReportDocumentIdentity',compiled+';return installReportDeparture;')(fs,expect,req=>{try{return JSON.parse(req.postDataBuffer());}catch{return null;}},()=>({appId:'app',envId:'env'}),departOwnedPlan,armPresenceLeave,serializeForgeResponse,ForgeResponseRecordError,createReportDocumentIdentity);
 const f=await browserFixture();let session;try{
  await f.page.context().route(app+'**',r=>r.fulfill({contentType:'text/html',body:'<html><body><script>setTimeout(()=>{document.body.innerHTML="<h1>LZPT Scenarios</h1>"},300)</script></body></html>'}));
  session=install(f.page,{accountId:'owner',timeoutMs:1000});session.own('plan-test-local','[harness-test] exact owner');await f.page.reload();assert.equal(await f.page.locator('iframe').contentFrame().getByText('LZPT Scenarios',{exact:true}).count(),0);await session.stop();assert.equal(f.page.url(),'about:blank');
 }finally{await session?.dispose();await f.close();}
});

test('wrong iframe identity and failed diagnostic persistence refuse rather than relax document proof',async()=>{
 const f=await browserFixture();try{await f.page.locator('iframe').evaluate(el=>el.setAttribute('data-testid','foreign-frame'));const wrong=f.identity.capture(19);assert.equal(await f.identity.current(wrong),false);assert.equal(wrong.released,true);await f.page.locator('iframe').evaluate(el=>el.setAttribute('data-testid','hosted-resources-iframe'));const broken=createReportDocumentIdentity({page:f.page,appId:'app',envId:'env',record:()=>{throw new Error('must-not-persist-arbitrary-error');},timeoutMs:1000});const b=broken.capture(20);await assert.rejects(broken.current(b),e=>e.message==='Document witness failed'&&!String(e).includes('must-not'));await assert.rejects(broken.dispose());assert.equal(b.released,true);}finally{await f.close();}
});
test('timed-out handle acquisition releases a late handle and never promotes its receipt',async()=>{
 const f=await browserFixture();try{const frame=f.page.frames().find(f.identity.matches),original=frame.evaluateHandle.bind(frame);let release,handleDisposed=false;const held=new Promise(r=>release=r);frame.evaluateHandle=async()=>{await held;const h=await original(()=>document),dispose=h.dispose.bind(h);h.dispose=async()=>{handleDisposed=true;await dispose();};return h;};const narrow=createReportDocumentIdentity({page:f.page,appId:'app',envId:'env',timeoutMs:10}),b=narrow.capture(19);assert.equal(await narrow.current(b),false);assert.equal(b.released,true);release();for(let n=0;n<100&&!handleDisposed;n++)await new Promise(r=>setTimeout(r,5));assert.equal(handleDisposed,true);await narrow.dispose();}finally{await f.close();}
});
test('held current-document evaluation expires, releases handle and permits bounded disposal',async()=>{
 const f=await browserFixture();try{const narrow=createReportDocumentIdentity({page:f.page,appId:'app',envId:'env',timeoutMs:20}),b=narrow.capture(19);assert.equal(await narrow.current(b),true);let released=false;const original=b.handle.dispose.bind(b.handle);b.handle.dispose=async()=>{released=true;await original();};b.handle.evaluate=()=>new Promise(()=>{});assert.equal(await narrow.current(b),false);assert.equal(released,true);assert.equal(b.released,true);await narrow.dispose();}finally{await f.close();}
});
