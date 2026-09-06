import assert from 'node:assert/strict';
import {admitPinnedDiagnostic} from './seventeenth-diagnostic-admission.mjs';
import {admitContextFirst,previousSha} from './seventeenth-context-first-contract.mjs';
export const contextFirstSha='4b67206915f2579a7c15b1e5b8c3018244cdae5a5c4a72689faa3848ab48d188';
export function admitPrelude(latest,digest,previous,olderDigest,now){
 const older=admitContextFirst(previous,olderDigest,now);assert.equal(latest.previousDiagnostic?.sha256,previousSha);
 const current=admitPinnedDiagnostic(latest,digest,now,{expectedSha:contextFirstSha,returnedMs:1788685219388});assert.deepEqual(current,older);return current;
}
