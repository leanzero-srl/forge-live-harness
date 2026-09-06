import assert from 'node:assert/strict';

// The actual plan hook JSON omits undefined metadata; some storage adapters return null.
// Neither representation proves deletion without empty rows and an exact absent registry.
export function assertDeletedPlan(value) {
 assert(value && typeof value === 'object' && !Array.isArray(value));
 const keys=Object.keys(value).sort();
 assert.deepEqual(keys,Object.hasOwn(value,'meta')?['issues','meta']:['issues']);
 if(Object.hasOwn(value,'meta')) assert.equal(value.meta,null);
 assert.deepEqual(value.issues,[]);
 return value;
}
export async function proveDeletedPlanTwice({planId,expectedRegistry,readPlan,readRegistry}) {
 assert.equal(typeof planId,'string');assert(planId.length>0);
 assert(Array.isArray(expectedRegistry));assert(expectedRegistry.every(id=>typeof id==='string'&&id.length>0));
 assert.equal(new Set(expectedRegistry).size,expectedRegistry.length);assert(!expectedRegistry.includes(planId));
 const observations=[];
 for(let pass=0;pass<2;pass++) {
  const plan=await readPlan(planId);assertDeletedPlan(plan);
  const registry=await readRegistry();assert(Array.isArray(registry));
  assert.deepEqual([...registry].sort(),[...expectedRegistry].sort());
  observations.push({plan,registry});
 }
 return observations;
}
