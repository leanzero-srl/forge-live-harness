import assert from 'node:assert/strict';

export function privateRetentionMode(value) {
 if(value===undefined||value==='') return false;
 assert.equal(value,'retain','Unknown private content disposition');
 return true;
}
