import assert from 'node:assert/strict';
import {actualPlanHook} from './producer.mjs';
const {body}=await actualPlanHook(undefined);
assert.deepEqual(body,{issues:[]});
assert.equal(body.meta,null,'Original private consumer requires null after actual hook serialized undefined');
