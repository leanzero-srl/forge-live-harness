const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {beginObservation,EXACT_EXECUTABLE}=require('../../forge/browser-process-observation.cjs');
const {launchProcess}=require(path.join(path.dirname(require.resolve('playwright-core')),'lib/coreBundle.js')).utils;
(async()=>{
 const o=beginObservation(EXACT_EXECUTABLE),b=new EventEmitter();b.connected=true;b.isConnected=()=>b.connected;
 const launched=await launchProcess({command:EXACT_EXECUTABLE,args:['--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--user-data-dir=/tmp/fixed'],env:{PATH:'/usr/bin:/bin'},stdio:'pipe',tempDirectories:[],handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,log:()=>{},onExit:()=>{},attemptToGracefullyClose:async()=>{}});
 o.attach(b);o.closing(b,'browser-close-start');o.logger.log('api','info','=> browser.close started');
 const closing=launched.gracefullyClose();await new Promise(r=>launched.launchedProcess.once('exit',r));await new Promise(r=>setTimeout(r,100));
 const file=path.join(process.env.LZ_BROWSER_PROCESS_OBSERVATION_DIR,`browser-process-${process.pid}.json`);const pending=JSON.parse(fs.readFileSync(file));assert(pending.events.some(e=>e.kind==='process-exit'));assert(!pending.events.some(e=>e.kind==='process-close'));assert.equal(pending.browserPid,launched.launchedProcess.pid);
 await closing;b.connected=false;b.emit('disconnected');o.logger.log('api','info','<= browser.close succeeded');o.closing(b,'browser-close-complete');o.check();console.log('installed launchProcess preload reaches actual ChildProcess; exit-before-pipes reproduced');
})().catch(error=>{console.error(error);process.exitCode=1;});
