import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const app='/Users/mihaiperdum/Projects/lz-ppm-forge';
export const cut='f4d87d058ed78946bc89817dbf5f2d24b97d1536';
export async function actualPlanHook(meta,rows=[]){
 const source=execFileSync('git',['show',`${cut}:src/test-hook.js`],{cwd:app,encoding:'utf8'});
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};const calls=[];
 const mocks={getPlanMeta:async id=>{calls.push(['meta',id]);return meta;},getAllIssues:async id=>{calls.push(['issues',id]);return new Map(rows.map((r,i)=>[i,r]));}};
 vm.runInNewContext(code,{exports:module.exports,module,require:()=>mocks,process:{env:{HARNESS_SECRET:'local-only-test'}},console});
 const response=await module.exports.testStateTrigger({headers:{authorization:['Bearer local-only-test']},queryParameters:{what:['plan'],planId:['owned']}});
 return {response,body:JSON.parse(response.body),calls};
}
