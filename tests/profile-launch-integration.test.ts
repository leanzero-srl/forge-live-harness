import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { launchReservedProfile } from '../forge/profile-reservation.ts';
const source=fs.readFileSync(new URL('../forge/browser.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
class Context extends EventEmitter { scripts=0;async addInitScript(){this.scripts++;}async close(){this.emit('close');} }
function fixture(t:test.TestContext){const root=fs.mkdtempSync(path.join(os.tmpdir(),'profile-integration-proof-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return{root,profile:path.join(root,'profile'),lockRoot:path.join(root,'locks')};}
function load(f:ReturnType<typeof fixture>,calls:unknown[]){const exports:{launchHarnessContext?:(options?:object)=>Promise<Context>}={};vm.runInNewContext(compiled,{exports,require(name:string){if(name==='./profile-reservation')return{launchReservedProfile:(profile:string,launch:Parameters<typeof launchReservedProfile<Context>>[1])=>launchReservedProfile(profile,launch,{lockRoot:f.lockRoot})};if(name==='@playwright/test')return{chromium:{async launchPersistentContext(profile:string,options:object){calls.push({profile,options});return new Context();}}};if(name==='../config/env')return{USER_DATA_DIR:f.profile,HEADLESS:true,VIEWPORT:{width:1440,height:900}};throw Error('Unexpected module '+name);}});return exports.launchHarnessContext!;}
test('actual central launcher preserves worker/video/auth options and context reservation across imports',async t=>{
 const f=fixture(t),calls:unknown[]=[];const launch=load(f,calls);const worker=await launch();assert.equal(worker.scripts,1);await assert.rejects(load(f,calls)(),{code:'PROFILE_BUSY'});assert.equal(calls.length,1);await worker.close();
 const video=await launch({recordVideoDir:path.join(f.root,'video')});await video.close();const auth=await launch({headed:true});await auth.close();
 const rows=JSON.parse(JSON.stringify(calls));assert.deepEqual(rows.map((r:{options:{headless:boolean}})=>r.options.headless),[true,true,false]);assert.equal(rows[1].options.recordVideo.dir,path.join(f.root,'video'));assert.deepEqual(rows[1].options.recordVideo.size,{width:1440,height:900});assert.ok(rows.every((r:{options:{channel:string,args:string[]}})=>r.options.channel==='chrome'&&r.options.args.includes('--no-first-run')));
});
test('all ordinary worker/video/auth launch sites still use the central function',()=>{
 const fixtureSource=fs.readFileSync(new URL('../fixtures/forge.ts',import.meta.url),'utf8'),authSource=fs.readFileSync(new URL('../auth/auth.setup.ts',import.meta.url),'utf8');assert.equal((fixtureSource.match(/await launchHarnessContext\(/g)||[]).length,2);assert.equal((authSource.match(/await launchHarnessContext\(/g)||[]).length,1);assert.ok(!/launchPersistentContext|SingletonLock/.test(fixtureSource+authSource));assert.ok(!/clearStaleProfileLocks|unlinkSync/.test(source));
});
test('actual batch runner launches browser lane without any kill or marker deletion command',t=>{
 const f=fixture(t);fs.mkdirSync(path.join(f.root,'scripts'));fs.copyFileSync(new URL('../scripts/run-batches.sh',import.meta.url),path.join(f.root,'scripts/run-batches.sh'));const specs=path.join(f.root,'scenarios','probe');fs.mkdirSync(specs,{recursive:true});fs.writeFileSync(path.join(specs,'one.spec.ts'),'// fixtures/forge\n');const bin=path.join(f.root,'bin');fs.mkdirSync(bin);for(const cmd of ['pkill','kill','killall','rm'])fs.writeFileSync(path.join(bin,cmd),'#!/bin/sh\nprintf forbidden >> "$FORBIDDEN_FILE"\nexit 97\n',{mode:0o700});fs.writeFileSync(path.join(bin,'npx'),'#!/bin/sh\nprintf called > "$LAUNCH_FILE"\nexit 0\n',{mode:0o700});const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,FORBIDDEN_FILE:path.join(f.root,'forbidden'),LAUNCH_FILE:path.join(f.root,'launched')};
 execFileSync('bash',[path.join(f.root,'scripts/run-batches.sh'),specs,'--plan','--run-id','isolated'],{env});execFileSync('bash',[path.join(f.root,'scripts/run-batches.sh'),specs,'--batch','1','--run-id','isolated'],{env});assert.equal(fs.existsSync(env.FORBIDDEN_FILE),false);assert.equal(fs.readFileSync(env.LAUNCH_FILE,'utf8'),'called');assert.equal(fs.readFileSync(path.join(f.root,'evidence/probe/isolated/batch-1.exit'),'utf8').trim(),'0');
});
