import assert from 'node:assert/strict';
import {admitForensic} from './seventeenth-forensic-contract.mjs';
export const forensicSha='e34de3b28b3ea07ed53f0b78e93abdf19cd9c5ffb9565d0c4980d79f0bf7a669';
export function admitSource(readonly,digest,prelude,preludeDigest,context,contextDigest,older,olderDigest,now){
 const previous=admitForensic(prelude,preludeDigest,context,contextDigest,older,olderDigest,now);assert.equal(digest,forensicSha);assert.equal(readonly.phase,'readonly');assert.equal(readonly.advanceCalls,0);assert.equal(readonly.sourceAndPreferencesPreserved,true);assert.equal(readonly.completed,false);assert.equal(readonly.preludeDiagnostic.sha256,preludeDigest);assert.deepEqual(readonly.finalJob,previous.job);assert.equal(readonly.probes.length,3);for(const probe of readonly.probes)assert.deepEqual(probe,previous.probe);assert.deepEqual(readonly.finalProbe,previous.probe);return previous;
}
export function verifySourceResult(result,{planId,jobId,entryHash,metaHash,expected}){
 assert.equal(result.schema,1);assert.equal(result.mode,'source');assert.equal(result.readOnly,true);assert.equal(result.committed,false);assert.equal(result.planId,planId);assert.equal(result.jobId,jobId);assert.equal(result.checkpoint,78);for(const k of ['context','hypothetical','job','report'])assert.equal(result[k],undefined);
 assert.equal(result.entryHashBefore,entryHash);assert.equal(result.entryHashAfter,entryHash);assert.equal(result.metaHashBefore,metaHash);assert.equal(result.metaHashAfter,metaHash);assert.deepEqual(result.source,expected);
 const phases=['source-context-get','source-context-check','raw-load','raw-byte-check','raw-decode-sort','basis-hash','hydrate'];assert.deepEqual(result.phases.map(p=>`${p.phase}/${p.event}`),phases.flatMap(p=>[`${p}/start`,`${p}/complete`]));for(const p of result.phases){assert.ok(Number.isSafeInteger(p.elapsedMs)&&p.elapsedMs>=0);assert.ok(!Object.keys(p).some(k=>!['phase','event','elapsedMs','completedChunks','totalChunks','totalPacks','encodedBytes'].includes(k)));}
 assert.deepEqual(Object.keys(result.timings).sort(),['admittedMs','bodyMs','totalMs','verifyMs']);for(const value of Object.values(result.timings))assert.ok(Number.isSafeInteger(value)&&value>=0);assert.ok(result.timings.totalMs>=result.timings.bodyMs);return result;
}
