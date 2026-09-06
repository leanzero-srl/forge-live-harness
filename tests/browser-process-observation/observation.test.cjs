const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const cp=require('node:child_process');
const {createObserver,installSpawnObserver,EXACT_EXECUTABLE}=require('../../forge/browser-process-observation.cjs');
const args=['--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--user-data-dir=/tmp/fixed-owned-profile'];
const options={detached:true,stdio:['ignore','pipe','pipe','pipe','pipe']};
function fixture(write){let receipt;const observer=createObserver({directory:'/tmp/owned-run',workerPid:42,parentPid:41,write:write||((_file,text)=>{receipt=JSON.parse(text);})});observer.arm(EXACT_EXECUTABLE);return{observer,receipt:()=>receipt};}
function child(){const c=new EventEmitter();c.pid=500;c.stdio=[null,...Array.from({length:4},()=>new EventEmitter())];return c;}
function browser(){const b=new EventEmitter();b.connected=true;b.isConnected=()=>b.connected;return b;}
function complete(o,c,b){o.attach(b);c.emit('spawn');o.closing(b,'browser-close-start');o.logger.log('api','info','=> browser.close started');c.emit('exit',0,null);for(const stream of c.stdio.slice(1))stream.emit('close');c.emit('close',0,null);b.connected=false;b.emit('disconnected');o.logger.log('api','info','<= browser.close succeeded');o.closing(b,'browser-close-complete');o.check();}

test('matching spawn preserves receiver, arguments, exact child and existing listeners; records no data',()=>{
 const {observer,receipt}=fixture(),c=child(),b=browser(),calls=[];
 const target={spawn(...values){calls.push({receiver:this,values});return c;}};
 const undo=installSpawnObserver(target,()=>observer);const returned=target.spawn(EXACT_EXECUTABLE,args,options);
 assert.equal(returned,c);assert.equal(calls[0].receiver,target);assert.equal(calls[0].values[1],args);assert.equal(calls[0].values[2],options);
 for(const stream of c.stdio.slice(1)){assert.equal(stream.listenerCount('data'),0);assert.equal(stream.listenerCount('readable'),0);}
 complete(observer,c,b);assert.equal(receipt().browserPid,500);assert.equal(receipt().events.length,15);undo();
});
test('wrong executable is entirely ignored; original synchronous spawn failure retains identity',()=>{
 const {observer,receipt}=fixture(),c=child(),error=Error('private sentinel');
 const target={spawn(){return c;}};installSpawnObserver(target,()=>observer);
 assert.equal(target.spawn('/foreign/browser',args,options),c);assert.equal(c.listenerCount('exit'),0);assert.equal(receipt().browserPid,null);
 const broken={spawn(){throw error;}};installSpawnObserver(broken,()=>observer);assert.throws(()=>broken.spawn(EXACT_EXECUTABLE,args,options),e=>e===error);
});
test('unarmed and wrong launch shapes never become a passing process witness',()=>{
 const c=child(),noObserver={spawn(){return c;}};installSpawnObserver(noObserver,()=>null);noObserver.spawn(EXACT_EXECUTABLE,args,options);assert.equal(c.listenerCount('exit'),0);
 for(const pair of [[args,{...options,detached:false}],[[],options],[args,{...options,stdio:'pipe'}]]){
  const {observer}=fixture();observer.observeSpawn(child(),...pair);assert.throws(()=>observer.check(),/incomplete/);
 }
});
test('missing pipe close, missing channel completion and duplicate process each refuse',()=>{
 for(const omit of ['pipe','channel','duplicate']){
  const {observer}=fixture(),c=child(),b=browser();observer.observeSpawn(c,args,options);observer.attach(b);c.emit('spawn');observer.closing(b,'browser-close-start');observer.logger.log('api','info','=> browser.close started');c.emit('exit',0,null);
  for(const [i,s] of c.stdio.entries())if(s&&(omit!=='pipe'||i!==2))s.emit('close');c.emit('close',0,null);b.connected=false;b.emit('disconnected');if(omit!=='channel')observer.logger.log('api','info','<= browser.close succeeded');observer.closing(b,'browser-close-complete');if(omit==='duplicate')observer.observeSpawn(child(),args,options);assert.throws(()=>observer.check(),/incomplete/);
 }
});
test('arbitrary log/error/header/argument text is never retained and failing sink cannot alter events',()=>{
 const {observer,receipt}=fixture(),c=child(),b=browser();observer.observeSpawn(c,args,options);
 observer.logger.log('api','info','<= browser.close failed secret-cookie');observer.logger.log('protocol','verbose','Authorization secret');
 complete(observer,c,b);assert(!JSON.stringify(receipt()).includes('secret'));assert(!JSON.stringify(receipt()).includes('profile'));assert(!JSON.stringify(receipt()).includes(EXACT_EXECUTABLE));
 const throwing=fixture(()=>{throw Error('secret');}).observer,c2=child();assert.doesNotThrow(()=>throwing.observeSpawn(c2,args,options));assert.doesNotThrow(()=>c2.emit('exit',0,null));assert.throws(()=>throwing.check(),/incomplete/);
});
test('original event listeners retain order and exceptions; observer does not add an error handler',()=>{
 const {observer}=fixture(),c=child(),order=[],error=Error('original');c.on('exit',()=>order.push('first'));observer.observeSpawn(c,args,options);c.on('exit',()=>order.push('last'));c.emit('exit',0,null);assert.deepEqual(order,['first','last']);assert.equal(c.listenerCount('error'),0);assert.throws(()=>c.emit('error',error),e=>e===error);
});
test('rejecting and nonsettling evidence sinks do not affect event dispatch and cannot pass',async()=>{
 for(const write of [()=>Promise.reject(Error('opaque')),()=>new Promise(()=>{})]){
  const {observer}=fixture(write),c=child();observer.observeSpawn(c,args,options);assert.doesNotThrow(()=>c.emit('exit',0,null));assert.throws(()=>observer.check(),/incomplete/);
 }
 await new Promise(resolve=>setImmediate(resolve));
});
test('actual portable integration keeps held close pending and exact launch options apart from logger',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'owned-process-'));const directory=path.join(base,'owned-run');fs.mkdirSync(directory);
 const result=cp.spawnSync(process.execPath,[path.join(__dirname,'portable-child.cjs')],{env:{...process.env,LZ_BROWSER_PROCESS_OBSERVATION_DIR:directory},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const files=fs.readdirSync(directory);assert.equal(files.length,1);const receipt=JSON.parse(fs.readFileSync(path.join(directory,files[0])));assert.equal(receipt.browserPid,98765);assert.equal(receipt.failed,false);assert.equal(receipt.events.length,15);
 fs.rmSync(base,{recursive:true,force:true});
});
test('actual Node preload observes the installed Playwright launchProcess reference and native events',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'owned-process-')),directory=path.join(base,'owned-run');fs.mkdirSync(directory);
 const result=cp.spawnSync(process.execPath,['--require',path.join(__dirname,'node-launch-bridge.cjs'),'--require',path.join(__dirname,'../../forge/browser-process-observation.cjs'),path.join(__dirname,'installed-launch-child.cjs')],{env:{...process.env,LZ_BROWSER_PROCESS_OBSERVATION_DIR:directory},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const files=fs.readdirSync(directory);assert.equal(files.length,1);const receipt=JSON.parse(fs.readFileSync(path.join(directory,files[0])));assert.equal(receipt.failed,false);assert.equal(receipt.events.length,15);assert(receipt.browserPid>0);fs.rmSync(base,{recursive:true,force:true});
});
test('actual owned Node child exit precedes inherited stdio close; missing close stays red until natural EOF',async()=>{
 for(const inherit of [false,true]){
  const {observer,receipt}=fixture();
  const source=`const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),700)'],{detached:true,stdio:${JSON.stringify(inherit?['ignore','inherit','inherit']:'ignore')}});c.unref();setTimeout(()=>process.exit(0),30);`;
  const c=cp.spawn(process.execPath,['-e',source],options);observer.observeSpawn(c,args,options);
  const done=new Promise(resolve=>c.once('close',resolve));await new Promise(resolve=>c.once('exit',resolve));await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(receipt().events.some(e=>e.kind==='process-close'),!inherit);
  assert.throws(()=>observer.check(),/incomplete/);await done;
  assert.equal(receipt().events.filter(e=>e.kind==='stdio-close').length,4);
  await new Promise(resolve=>setTimeout(resolve,750));
 }
});
