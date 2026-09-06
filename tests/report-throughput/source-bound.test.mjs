import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';import ts from 'typescript';
const base='c66b5f97e059fd82effdc94b5b62673137d6f9ce';
function assertions(source){const sf=ts.createSourceFile('input.ts',source,ts.ScriptTarget.Latest,true);const result=[];function visit(node){if(ts.isCallExpression(node)&&/^expect(?:\(|\.)/.test(node.getText(sf)))result.push(node.getText(sf).replace(/\s+/g,' '));ts.forEachChild(node,visit);}visit(sf);return result;}
test('every preexisting large-unit and shared-capture expectation is unchanged',()=>{
 for(const path of ['scenarios/lz-ppm/journey-campaign-large-history.spec.ts','scenarios/lz-ppm/report-capture.ts']){const old=execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'});const current=fs.readFileSync(path,'utf8');const before=assertions(old),after=assertions(current);assert.ok(before.length>20);assert.deepEqual(after,before,path);}
 const capture=fs.readFileSync('scenarios/lz-ppm/report-capture.ts','utf8');assert.match(capture,/timeoutMs=600000/);
 const observer=fs.readFileSync('scenarios/lz-ppm/report-throughput-observer.mjs','utf8');assert.doesNotMatch(observer,/\.route\(|\.fetch\(|\.post\(|\.goto\(|\.waitFor|route\.continue/);
});
