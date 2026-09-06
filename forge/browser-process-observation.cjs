// Opt-in Node preload. Observe one explicitly armed portable spawn; never read
// stream data, alter arguments, replace a promise, signal a process or close it.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const EXACT_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EVENT_NAMES = new Set(['armed','spawn-returned','process-spawn','process-exit','stdio-close','process-close','browser-attached','browser-disconnected','browser-close-start','browser-close-complete','browser-close-failed','channel-close-start','channel-close-complete','channel-close-failed']);

function createObserver({directory, workerPid=process.pid, parentPid=process.ppid, now=()=>performance.now(), write=fs.writeFileSync}) {
  if (!path.isAbsolute(directory) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(path.basename(directory))) throw Error('Browser process observation directory invalid');
  const runId=path.basename(directory), events=[];
  let failed=false, last=-Infinity, browserPid=null, armed=false, attached=false;
  const file=path.join(directory,`browser-process-${workerPid}.json`);
  function event(kind, fields={}) {
    try {
      const atMs=now();
      if (!EVENT_NAMES.has(kind) || events.length>=32 || !Number.isFinite(atMs) || atMs<last) throw Error();
      const safe={};
      if ('pid' in fields) { if(!Number.isSafeInteger(fields.pid)||fields.pid<1)throw Error(); safe.pid=fields.pid; }
      if ('stream' in fields) { if(![1,2,3,4].includes(fields.stream))throw Error(); safe.stream=fields.stream; }
      if ('connected' in fields) { if(typeof fields.connected!=='boolean')throw Error(); safe.connected=fields.connected; }
      if ('exitCode' in fields) { if(fields.exitCode!==null&&!Number.isSafeInteger(fields.exitCode))throw Error(); safe.exitCode=fields.exitCode; }
      if ('signal' in fields) safe.signal=fields.signal===null?null:['SIGTERM','SIGKILL','SIGINT','SIGHUP','SIGABRT','SIGSEGV','SIGBUS','SIGILL','SIGTRAP'].includes(fields.signal)?fields.signal:'OTHER';
      last=atMs;events.push({kind,atMs,...safe});
      const result=write(file,JSON.stringify({schema:'owned-browser-process-v1',runId,workerPid,parentPid,browserPid,failed,events},null,2),{mode:0o600});
      // The real journal writer is synchronous. Async test sinks are rejected
      // as evidence, but are never awaited or allowed to reject the event loop.
      if(result&&typeof result.then==='function'){failed=true;Promise.resolve(result).catch(()=>{});}
    } catch { failed=true; }
  }
  function observeSpawn(child, args, options) {
    if (!armed) return;
    // Only the exact default portable launch shape is an admitted observation.
    if (browserPid!==null || !Array.isArray(args) || !args.includes('--remote-debugging-pipe') || !args.includes('--no-first-run') || !args.includes('--no-default-browser-check') || args.filter(a=>typeof a==='string'&&a.startsWith('--user-data-dir=')).length!==1 || options?.detached!==true || (!Array.isArray(options.stdio)?null:options.stdio.join('|'))!=='ignore|pipe|pipe|pipe|pipe' || !Number.isSafeInteger(child?.pid)) { failed=true; return; }
    browserPid=child.pid;event('spawn-returned',{pid:browserPid});
    child.once('spawn',()=>event('process-spawn'));
    child.once('exit',(exitCode,signal)=>event('process-exit',{exitCode,signal}));
    child.once('close',(exitCode,signal)=>event('process-close',{exitCode,signal}));
    for (const stream of [1,2,3,4]) {
      if (!child.stdio?.[stream]?.once) { failed=true; continue; }
      child.stdio[stream].once('close',()=>event('stdio-close',{stream}));
    }
  }
  return {
    arm(executable) { if(armed||executable!==EXACT_EXECUTABLE)throw Error('Browser process observation admission failed');armed=true;event('armed');return this; },
    observeSpawn,
    reject(){failed=true;},
    logger:{isEnabled:(name,severity)=>name==='api'&&severity==='info',log(name,severity,message){
      if(name!=='api'||severity!=='info')return;
      const kind=new Map([['=> browser.close started','channel-close-start'],['<= browser.close succeeded','channel-close-complete'],['<= browser.close failed','channel-close-failed']]).get(message);
      if(kind)event(kind);
    }},
    attach(browser) { if(attached){failed=true;return;}attached=true;try{event('browser-attached',{connected:browser.isConnected()});browser.once('disconnected',()=>{try{event('browser-disconnected',{connected:browser.isConnected()});}catch{failed=true;}});}catch{failed=true;} },
    closing(browser,kind) { try{event(kind,{connected:browser.isConnected()});}catch{failed=true;} },
    check(){
      const count=kind=>events.filter(e=>e.kind===kind).length;
      if(failed||!browserPid||!attached||['armed','spawn-returned','process-spawn','process-exit','process-close','browser-attached','browser-disconnected','browser-close-start','browser-close-complete','channel-close-start','channel-close-complete'].some(kind=>count(kind)!==1)||count('channel-close-failed')||count('browser-close-failed')||[1,2,3,4].some(stream=>events.filter(e=>e.kind==='stdio-close'&&e.stream===stream).length!==1))throw Error('Browser process observation incomplete or failed');
    }
  };
}

function installSpawnObserver(target, current) {
  const original=target.spawn;
  target.spawn=function(...args) {
    const child=Reflect.apply(original,this,args);
    if(args[0]===EXACT_EXECUTABLE) {
      try { current()?.observeSpawn(child,args[1],args[2]); } catch { try{current()?.reject();}catch{} }
    }
    return child;
  };
  return ()=>{target.spawn=original;};
}

let active=null;
const directory=process.env.LZ_BROWSER_PROCESS_OBSERVATION_DIR;
if(directory) installSpawnObserver(cp,()=>active);
function beginObservation(executable) {
  if(!directory)return null;
  if(active)throw Error('Browser process observation already armed');
  // This output is owned by this worker. No shared file is overwritten.
  if(!fs.statSync(directory).isDirectory())throw Error('Browser process observation directory unavailable');
  const observer=createObserver({directory});
  const file=path.join(directory,`browser-process-${process.pid}.json`);
  const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);fs.closeSync(fd);
  active=observer;return active.arm(executable);
}
module.exports={beginObservation,createObserver,installSpawnObserver,EXACT_EXECUTABLE};
