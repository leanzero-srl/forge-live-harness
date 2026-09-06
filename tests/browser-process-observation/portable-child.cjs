const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const cp=require('node:child_process');
// Before loading the observer, install a local fake spawn: no actual Chrome.
const child=new EventEmitter();child.pid=98765;child.stdio=[null,...Array.from({length:4},()=>new EventEmitter())];
cp.spawn=function(file,args,options){assert.equal(file,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');queueMicrotask(()=>child.emit('spawn'));return child;};
(async()=>{
 const {createPortableLauncher,MODE,VERSION}=await import('../../forge/portable-browser.mjs');
 const b=new EventEmitter(),c=new EventEmitter();let logger,release;const calls=[];b.connected=true;b.isConnected=()=>b.connected;
 b.version=()=>VERSION;b.newContext=async options=>{calls.push('context');assert.deepEqual(options,{storageState:{cookies:[],origins:[]},viewport:{width:100,height:100},acceptDownloads:true});return c;};
 c.pages=()=>[];c.newPage=async()=>{};c.close=async()=>{calls.push('context-close');c.emit('close');};
 b.close=async()=>{calls.push('browser-close');logger.log('api','info','=> browser.close started');await new Promise(r=>release=r);child.emit('exit',0,null);for(const s of child.stdio.slice(1))s.emit('close');child.emit('close',0,null);b.connected=false;b.emit('disconnected');logger.log('api','info','<= browser.close succeeded');};
 const launch=createPortableLauncher({chromium:{launch:async options=>{logger=options.logger;const {logger:unused,...actual}=options;assert.deepEqual(actual,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check']});cp.spawn(actual.executablePath,['--remote-debugging-pipe',...actual.args,'--user-data-dir=/tmp/fixed'],{detached:true,stdio:['ignore','pipe','pipe','pipe','pipe']});return b;}},readAdmission:()=>({cookies:[],origins:[]}),verifyIdentity:async()=>{},installHostFlagSuppressor:async()=>{}});
 const context=await launch({mode:MODE,viewport:{width:100,height:100},expected:{accountId:'local',uiVersion:'1.2.3'}});
 let settled=false;const closing=context.close().then(()=>settled=true);await new Promise(r=>setImmediate(r));assert.equal(settled,false);release();await closing;assert.deepEqual(calls,['context','context-close','browser-close']);
 console.log('actual portable opt-in passed; original held close remained pending');
})().catch(error=>{console.error(error);process.exitCode=1;});
