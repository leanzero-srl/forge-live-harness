import ts from 'typescript';import {withoutRetention} from '../private-retention-mode/source.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
test('both complete scenarios change only the shared deletion proof and import',()=>{
 for(const name of ['campaign-private-staged-report.spec.ts','campaign-private-retained-continuation.spec.ts']){
  const file=`scenarios/lz-ppm/${name}`,old=execFileSync('git',['show',`61fe5ee:${file}`],{encoding:'utf8'});let current=fs.readFileSync(file,'utf8');if(name==='campaign-private-staged-report.spec.ts')current=withoutRetention(current);current=current.replace("import {proveDeletedPlanTwice} from './deleted-plan-absence.mjs';\n",'');
  if(name==='campaign-private-staged-report.spec.ts')current=current.replace("await proveDeletedPlanTwice({planId:source.meta.id,expectedRegistry:originals,readPlan:(planId:string)=>hook({what:'plan',planId}),readRegistry:async()=>{const result=await hook({what:'plans'});return result.plans.map((p:any)=>p.id);}});","for(let n=0;n<2;n++){expect((await hook({what:'plan',planId:source.meta.id})).meta).toBeNull();await registry(originals);}");
  else current=current.replace("await proveDeletedPlanTwice({planId:retainedPins.sourcePlanId,expectedRegistry:originalPlans,readPlan:(planId:string)=>hook({what:'plan',planId}),readRegistry:registry});","for(let n=0;n<2;n++){expect((await hook({what:'plan',planId:retainedPins.sourcePlanId})).meta).toBeNull();expect(await registry()).toEqual([...originalPlans].sort());}");
  const print=text=>ts.createPrinter({removeComments:true}).printFile(ts.createSourceFile('spec.ts',text,ts.ScriptTarget.Latest,true));assert.equal(print(current),print(old),name);
 }
});
