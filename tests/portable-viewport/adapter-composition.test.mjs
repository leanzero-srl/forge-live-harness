import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPortableLauncher,MODE,VERSION} from '../../forge/portable-browser.mjs';
// Installed adapter + installed sizing helper; only the external browser ports
// and readiness boundary are fake. No credential file, network or site access.
test('actual portable admission installs awaited sizing before readiness and preserves browser teardown',async()=>{
 const context=new EventEmitter(),browser=new EventEmitter(),pages=[],events=[];
 context.pages=()=>pages.filter(p=>!p.closed);
 context.newPage=async()=>{const p={closed:false,size:{width:1440,height:900},isClosed(){return this.closed;},viewportSize(){return this.size;},async setViewportSize(v){this.size=v;},async close(){this.closed=true;}};pages.push(p);return p;};
 context.newCDPSession=async()=>({async send(method,args){if(method==='Browser.getWindowForTarget')return{windowId:1};events.push(args);},async detach(){}});
 context.close=async()=>{events.push('context-close');for(const p of pages)p.closed=true;context.emit('close');};
 browser.version=()=>VERSION;browser.newContext=async()=>context;browser.close=async()=>{events.push('browser-close');browser.emit('disconnected');};
 let main;
 const launch=createPortableLauncher({chromium:{launch:async()=>browser},readAdmission:()=>({cookies:[],origins:[]}),installHostFlagSuppressor:async()=>{},verifyIdentity:async ctx=>{main=await ctx.newPage();assert.deepEqual(events.at(-1),{windowId:1,width:1440,height:900});await main.setViewportSize({width:1600,height:1100});const auxiliary=await ctx.newPage();assert.deepEqual(events.at(-1),{windowId:1,width:1600,height:1100});await auxiliary.close();assert.deepEqual(events.at(-1),{windowId:1,width:1600,height:1100});}});
 const admitted=await launch({mode:MODE,expected:{accountId:'local',uiVersion:'1.2.3'},viewport:{width:1440,height:900}});
 await main.setViewportSize({width:1100,height:1000});assert.deepEqual(events.at(-1),{windowId:1,width:1100,height:1000});await admitted.close();assert.deepEqual(events.slice(-2),['context-close','browser-close']);
});
