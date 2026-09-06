import test from 'node:test';
import assert from 'node:assert/strict';
import {actualPlanHook} from './producer.mjs';
import {assertDeletedPlan,proveDeletedPlanTwice} from '../../scenarios/lz-ppm/deleted-plan-absence.mjs';

test('complete deployed producer serializes missing metadata and null without discarding issue rows',async()=>{
 for(const meta of [undefined,null]){const {body,response,calls}=await actualPlanHook(meta);assert.equal(response.statusCode,200);assert.deepEqual(body,meta===undefined?{issues:[]}:{meta:null,issues:[]});assertDeletedPlan(body);assert.deepEqual(calls,[['meta','owned'],['issues','owned']]);}
 const {body}=await actualPlanHook(undefined,[{key:'leftover'}]);assert.throws(()=>assertDeletedPlan(body));
});
test('wrong metadata, missing rows, ambiguous body and unadvertised fields fail closed',()=>{
 for(const body of [{},{meta:null},{issues:null},{issues:[{}]},{issues:[],meta:{}},{issues:[],meta:false},{issues:[],meta:0},{issues:[],meta:''},{issues:[],meta:undefined},{issues:[],error:'denied'},[],null])assert.throws(()=>assertDeletedPlan(body));
});
test('two independent plan/registry pairs required in exact order',async()=>{
 const calls=[];const proof=await proveDeletedPlanTwice({planId:'owned',expectedRegistry:['b','a'],readPlan:async id=>{calls.push(['plan',id]);return {issues:[]};},readRegistry:async()=>{calls.push(['registry']);return ['a','b'];}});
 assert.equal(proof.length,2);assert.deepEqual(calls,[['plan','owned'],['registry'],['plan','owned'],['registry']]);
});
test('first/second rows or registry resurrection and duplicates refuse without retry',async()=>{
 for(const kind of ['rows1','rows2','registry1','registry2','duplicate']){let reads=0,registries=0;await assert.rejects(proveDeletedPlanTwice({planId:'owned',expectedRegistry:['a'],readPlan:async()=>({issues:++reads===(kind==='rows1'?1:kind==='rows2'?2:0)?[{}]:[]}),readRegistry:async()=>++registries===(kind==='registry1'?1:kind==='registry2'?2:0)?['a','owned']:kind==='duplicate'?['a','a']:['a']}));assert(reads<=2&&registries<=2);}
});
test('rejected second read retains error identity and never converts to empty',async()=>{
 const error=new Error('transport');let n=0;await assert.rejects(proveDeletedPlanTwice({planId:'owned',expectedRegistry:[],readPlan:async()=>{if(++n===2)throw error;return{issues:[]};},readRegistry:async()=>[]}),e=>e===error);assert.equal(n,2);
});
