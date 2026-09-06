import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import ts from 'typescript';
import {settledScreenshot} from '../../scenarios/lz-ppm/settled-screenshot.mjs';
const source=process.env.LZ_PRIVATE_OLD_SCREENSHOT==='1'?execFileSync('git',['show','ff48d10:scenarios/lz-ppm/campaign-private-staged-report.spec.ts'],{encoding:'utf8'}):fs.readFileSync('scenarios/lz-ppm/campaign-private-staged-report.spec.ts','utf8');
const ast=ts.createSourceFile('actual.ts',source,ts.ScriptTarget.Latest,true);let call;function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='settledScreenshot'){assert.equal(call,undefined);call=n.getText(ast);}ts.forEachChild(n,visit);}visit(ast);assert(call);
const invoke=new Function('documentPage','info','settledScreenshot','return '+call);
class Locator{async _expect(){return {matches:true,log:[],received:true};}async scrollIntoViewIfNeeded(){}async evaluate(){return true;}}
test('actual compiled screenshot call supplies body to unchanged real settledScreenshot boundary',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'private-shot-boundary-')),body=new Locator();let captures=0,locatorCalls=[];const bytes=fs.readFileSync('/Users/mihaiperdum/Projects/lz-ppm-forge/docs/campaign-2026-09/private-owner-root-actual-html.png');
 const documentPage={context(){return {};},locator(name){locatorCalls.push(name);assert.equal(name,'body');return body;},async screenshot(options){captures++;assert.equal(options.fullPage,true);return bytes;}};
 try{const result=await invoke(documentPage,{outputPath:name=>path.join(directory,name)},settledScreenshot);assert.equal(result.nonblank,true);assert.equal(captures,1);assert.deepEqual(locatorCalls,['body']);assert.deepEqual(fs.readFileSync(path.join(directory,'private-owner-report.png')),bytes);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
