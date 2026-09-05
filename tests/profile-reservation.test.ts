import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once, EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertProfileHasNoOwner, reserveProfile, launchReservedProfile } from '../forge/profile-reservation.ts';
const client = fileURLToPath(new URL('./profile-reservation/client.ts', import.meta.url));
const mark = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'RunningChromeVersion'];
function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reservation-proof-'));
  const profile = path.join(root, 'profile'), lockRoot = path.join(root, 'locks');
  fs.mkdirSync(profile);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, profile, lockRoot };
}
function child(mode: string, profile: string, lockRoot: string) {
  const p = spawn(process.execPath, ['--import', 'tsx', client, mode, profile, lockRoot], { stdio: 'pipe' });
  return p;
}
function line(p: ChildProcessWithoutNullStreams): Promise<{kind: string; holderPid?: number; lockFile?: string; code?: string}> {
  return new Promise((resolve, reject) => {
    let buffer = ''; const timer = setTimeout(() => { clean(); reject(Error('Child readiness timed out')); }, 5000);
    const data = (c: Buffer) => { buffer += c.toString(); if (buffer.includes('\n')) { clean(); resolve(JSON.parse(buffer.split('\n')[0])); } };
    const clean = () => { clearTimeout(timer); p.stdout.off('data', data); };
    p.stdout.on('data', data);
  });
}
async function closeChild(p: ChildProcessWithoutNullStreams) { const result = line(p); p.stdin.write('close\n'); assert.equal((await result).kind, 'closed'); await exited(p); }
async function exited(p: ChildProcessWithoutNullStreams) { if (p.exitCode === null && p.signalCode === null) await once(p, 'exit'); }
class Context extends EventEmitter { closes = 0; async close() { this.closes++; this.emit('close'); } }

test('two independent processes: exactly one launch entrant, loser busy; close permits next entrant', async t => {
  const f = fixture(t); const a = child('launch', f.profile, f.lockRoot); t.after(() => a.kill());
  assert.equal((await line(a)).kind, 'entered');
  const b = child('launch', f.profile, f.lockRoot); assert.deepEqual(await line(b), {kind:'denied',code:'PROFILE_BUSY'}); await exited(b);
  await closeChild(a);
  const c = child('launch', f.profile, f.lockRoot); t.after(() => c.kill()); assert.equal((await line(c)).kind,'entered'); await closeChild(c);
});
test('canonical symlink alias shares one lock; different profiles remain independent; inode survives release', async t => {
  const f=fixture(t); const alias=path.join(f.root,'alias');fs.symlinkSync(f.profile,alias);
  const a=await reserveProfile(f.profile,{lockRoot:f.lockRoot}); const inode=fs.statSync(a.lockFile).ino;
  await assert.rejects(reserveProfile(alias,{lockRoot:f.lockRoot}),{code:'PROFILE_BUSY'});
  const b=await reserveProfile(path.join(f.root,'other'),{lockRoot:f.lockRoot});await b.cleanClose();await a.cleanClose();
  const c=await reserveProfile(alias,{lockRoot:f.lockRoot});assert.equal(fs.statSync(c.lockFile).ino,inode);await c.cleanClose();
});
for (const mode of ['parent-exit','parent-kill','holder-kill']) test(`${mode} leaves durable unclean intent before any Chrome marker; next launch refused`, async t => {
  const f=fixture(t);const p=child('reserve',f.profile,f.lockRoot);t.after(()=>p.kill());const first=await line(p);assert.equal(first.kind,'acquired');
  if(mode==='holder-kill')process.kill(first.holderPid!,'SIGKILL');
  else if(mode==='parent-kill')p.kill('SIGKILL');else p.stdin.write('exit\n');
  if(mode!=='holder-kill')await exited(p);
  // Poll lock contention until the kernel releases the dead holder, never delete its journal.
  let refusal:unknown;for(let n=0;n<50;n++){try{await reserveProfile(f.profile,{lockRoot:f.lockRoot});assert.fail('unclean reservation acquired');}catch(e){refusal=e;if((e as {code?:string}).code==='PROFILE_UNAVAILABLE')break;}await new Promise(r=>setTimeout(r,20));}
  assert.equal((refusal as {code:string}).code,'PROFILE_UNAVAILABLE');assert.equal(fs.readdirSync(f.profile).length,0);
  if(mode==='holder-kill'){p.kill();await exited(p);}
});
test('holder death while live Node context closes only owned context and durable intent blocks new launch', async t => {
  const f=fixture(t);const ctx=new Context();const result=await launchReservedProfile(f.profile,async()=>ctx,{lockRoot:f.lockRoot});
  const record=JSON.parse(fs.readFileSync(path.join(f.lockRoot,fs.readdirSync(f.lockRoot)[0]),'utf8'));const closed=once(ctx,'close');process.kill(record.holderPid,'SIGKILL');await closed;assert.equal(result.closes,1);
  await assert.rejects(launchReservedProfile(f.profile,async()=>{assert.fail('must not launch');},{lockRoot:f.lockRoot}),{code:'PROFILE_UNAVAILABLE'});
});
for(const target of [undefined,'malformed','foreign-host-123',`${os.hostname()}-${process.pid}`,`${os.hostname()}-123456789`])test(`marker state ${target??'missing owner'} is preserved and blocks launch`,async t=>{
  const f=fixture(t);if(target)fs.symlinkSync(target,path.join(f.profile,'SingletonLock'));for(const name of mark.slice(1))fs.writeFileSync(path.join(f.profile,name),'witness');const before=fs.readdirSync(f.profile).sort();
  assert.throws(()=>assertProfileHasNoOwner(f.profile));await assert.rejects(launchReservedProfile(f.profile,async()=>{assert.fail('launch forbidden');},{lockRoot:f.lockRoot}));assert.deepEqual(fs.readdirSync(f.profile).sort(),before);if(target)assert.equal(fs.readlinkSync(path.join(f.profile,'SingletonLock')),target);
  // A prelaunch refusal has no owned browser: it must not poison its own reservation.
  const r=await reserveProfile(f.profile,{lockRoot:f.lockRoot});await r.cancelUnlaunched();
});
test('non-symlink marker remains untouched; existing empty/malformed reservation fails closed',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.profile,'SingletonLock'),'not symlink');assert.throws(()=>assertProfileHasNoOwner(f.profile));assert.equal(fs.readFileSync(path.join(f.profile,'SingletonLock'),'utf8'),'not symlink');fs.unlinkSync(path.join(f.profile,'SingletonLock'));
  const r=await reserveProfile(f.profile,{lockRoot:f.lockRoot});await r.cleanClose();for(const raw of ['', '{}', '{broken']){fs.writeFileSync(r.lockFile,raw);await assert.rejects(reserveProfile(f.profile,{lockRoot:f.lockRoot}),{code:'PROFILE_UNAVAILABLE'});assert.equal(fs.readFileSync(r.lockFile,'utf8'),raw);}
});
test('known missing Chrome permits fallback under same reservation, preserves both failed causes',async t=>{
  const f=fixture(t);const errors=[Error("Chromium distribution 'chrome' is not found"),Error('bundled failed')];const channels:string[]=[];
  await assert.rejects(launchReservedProfile(f.profile,async(_,channel)=>{channels.push(channel);throw errors[channels.length-1];},{lockRoot:f.lockRoot}),e=>e instanceof AggregateError&&e.errors[0]===errors[0]&&e.errors[1]===errors[1]);assert.deepEqual(channels,['chrome','chromium']);
  await assert.rejects(reserveProfile(f.profile,{lockRoot:f.lockRoot}),{code:'PROFILE_UNAVAILABLE'});
});
test('unknown Chrome launch failure never starts a fallback or clears orphan markers',async t=>{
  const f=fixture(t);let calls=0;const error=Error('launch timed out');await assert.rejects(launchReservedProfile(f.profile,async()=>{calls++;fs.symlinkSync(`${os.hostname()}-${process.pid}`,path.join(f.profile,'SingletonLock'));throw error;},{lockRoot:f.lockRoot}),e=>e===error);assert.equal(calls,1);assert.ok(fs.lstatSync(path.join(f.profile,'SingletonLock')).isSymbolicLink());
  await assert.rejects(reserveProfile(f.profile,{lockRoot:f.lockRoot}),{code:'PROFILE_UNAVAILABLE'});
});
test('explicit close failure and unexpected context close retain unclean intent',async t=>{
  for(const mode of ['unexpected','failed']){const f=fixture(t);const ctx=new Context();if(mode==='failed')ctx.close=async()=>{throw Error('close failed');};const c=await launchReservedProfile(f.profile,async()=>ctx,{lockRoot:f.lockRoot});if(mode==='unexpected')ctx.emit('close');else await assert.rejects(c.close(),/close failed/);await assert.rejects(reserveProfile(f.profile,{lockRoot:f.lockRoot}),{code:'PROFILE_UNAVAILABLE'});}
});
test('clean close waits for actual context close completion before releasing; duplicate close is idempotent',async t=>{
  const f=fixture(t);let resolve!:()=>void;const ctx=new Context();ctx.close=async()=>{ctx.emit('close');await new Promise<void>(r=>{resolve=r;});};const c=await launchReservedProfile(f.profile,async()=>ctx,{lockRoot:f.lockRoot});const closing=c.close();await assert.rejects(reserveProfile(f.profile,{lockRoot:f.lockRoot}),{code:'PROFILE_BUSY'});resolve();await closing;await c.close();const r=await reserveProfile(f.profile,{lockRoot:f.lockRoot});await r.cleanClose();
});

test('EPERM and stale-read replacement preserve all markers without unlink',t=>{
 const f=fixture(t);fs.symlinkSync(`${os.hostname()}-123456789`,path.join(f.profile,'SingletonLock'));fs.writeFileSync(path.join(f.profile,'SingletonCookie'),'sentinel');
 const originalKill=process.kill;try{process.kill=(()=>{throw Object.assign(Error('denied'),{code:'EPERM'});}) as typeof process.kill;assert.throws(()=>assertProfileHasNoOwner(f.profile),{code:'PROFILE_BUSY'});}finally{process.kill=originalKill;}
 const readlink=fs.readlinkSync;let replaced=false;try{fs.readlinkSync=((name:fs.PathLike)=>{const old=readlink(name);if(!replaced){fs.unlinkSync(name);fs.symlinkSync(`${os.hostname()}-${process.pid}`,name);replaced=true;}return old;}) as typeof fs.readlinkSync;assert.throws(()=>assertProfileHasNoOwner(f.profile),{code:'PROFILE_UNAVAILABLE'});}finally{fs.readlinkSync=readlink;}
 assert.equal(fs.readlinkSync(path.join(f.profile,'SingletonLock')),`${os.hostname()}-${process.pid}`);assert.equal(fs.readFileSync(path.join(f.profile,'SingletonCookie'),'utf8'),'sentinel');
});
test('holder lost during pending launch closes the eventual returned owned context and never returns it',async t=>{
 const f=fixture(t);const ctx=new Context();let resolve!:(value:Context)=>void;const pending=launchReservedProfile(f.profile,()=>new Promise<Context>(r=>{resolve=r;}),{lockRoot:f.lockRoot});
 while(!resolve)await new Promise(r=>setTimeout(r,5));const record=JSON.parse(fs.readFileSync(path.join(f.lockRoot,fs.readdirSync(f.lockRoot)[0]),'utf8'));process.kill(record.holderPid,'SIGKILL');await new Promise(r=>setTimeout(r,30));resolve(ctx);await assert.rejects(pending,{code:'HOLDER_LOST'});assert.equal(ctx.closes,1);
});
test('known absent Chrome fallback success remains reserved until close',async t=>{
 const f=fixture(t);let calls=0;const ctx=await launchReservedProfile(f.profile,async()=>{if(calls++===0)throw Error("Chromium distribution 'chrome' is not found");await assert.rejects(reserveProfile(f.profile,{lockRoot:f.lockRoot}),{code:'PROFILE_BUSY'});return new Context();},{lockRoot:f.lockRoot});assert.equal(calls,2);await ctx.close();const r=await reserveProfile(f.profile,{lockRoot:f.lockRoot});await r.cleanClose();
});
test('missing Python and bounded unresponsive holder never launch a browser',async t=>{
 const f=fixture(t);await assert.rejects(launchReservedProfile(f.profile,async()=>{assert.fail('must not launch');},{lockRoot:f.lockRoot,python:path.join(f.root,'nonexistent')}),{code:'HOLDER_LOST'});
 const fake=path.join(f.root,'fake-python');fs.writeFileSync(fake,'#!/bin/sh\nexec /bin/sleep 30\n',{mode:0o700});const start=Date.now();await assert.rejects(launchReservedProfile(f.profile,async()=>{assert.fail('must not launch');},{lockRoot:f.lockRoot,python:fake,readinessTimeoutMs:80}),{code:'HOLDER_LOST'});assert.ok(Date.now()-start<1500);
});
test('clean-close refuses surviving Chrome owner markers and leaves orphan protected',async t=>{
 const f=fixture(t);const r=await reserveProfile(f.profile,{lockRoot:f.lockRoot});const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'pipe'});t.after(()=>p.kill());fs.symlinkSync(`${os.hostname()}-${p.pid}`,path.join(f.profile,'SingletonLock'));await assert.rejects(r.cleanClose(),{code:'PROFILE_UNAVAILABLE'});await assert.rejects(reserveProfile(f.profile,{lockRoot:f.lockRoot}),{code:'PROFILE_UNAVAILABLE'});assert.doesNotThrow(()=>process.kill(p.pid!,0));p.kill();await exited(p);
});
