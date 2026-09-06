import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
test('removing only explicit retained-only branches recovers exact reviewed ordinary session bytes',()=>{
 const file='scenarios/lz-ppm/private-report-witness-session.ts',before=execFileSync('git',['show','1672959:'+file],{encoding:'utf8'});let actual=fs.readFileSync(file,'utf8');
 actual=actual.replace('{record,timeoutMs=120000,retainedOnly=false}:any','{record,timeoutMs=120000}:any').replace('let retainedAdmitted=false;\n ','');
 actual=actual.replace("if(retainedOnly)assert(retainedAdmitted&&owner?.kind==='private','Retained private owner is not admitted');",'');
 actual=actual.replace("(retainedOnly?['getPlan','getSimulationModel','getDraft','getActiveDrafts']:['getPlan','getSimulationModel'])","['getPlan','getSimulationModel']");
 actual=actual.replace("assert(!retainedOnly,'Retained continuation cannot fork');",'').replace("assert(!retainedOnly,'Retained continuation cannot capture');",'');
 const start=actual.indexOf('  retainedCandidate('),end=actual.indexOf('  async fork(',start);assert(start>0&&end>start);actual=actual.slice(0,start)+actual.slice(end);assert.equal(actual,before);
});
