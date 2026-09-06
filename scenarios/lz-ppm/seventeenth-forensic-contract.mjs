import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const keyHash=key=>createHash('sha256').update(JSON.stringify(key)).digest('hex');
import {admitPinnedDiagnostic} from './seventeenth-diagnostic-admission.mjs';
import {admitPrelude,contextFirstSha} from './seventeenth-prelude-contract.mjs';
export const preludeSha='ccca27e6370abbc8fc784b31e5561e0c72464c79c64b59bd574ecaa768846752';
export function admitForensic(prelude,digest,context,contextDigest,older,olderDigest,now){
 const previous=admitPrelude(context,contextDigest,older,olderDigest,now);assert.equal(prelude.previousDiagnostic?.sha256,contextFirstSha);assert.equal(prelude.olderDiagnostic?.sha256,olderDigest);
 const current=admitPinnedDiagnostic(prelude,digest,now,{expectedSha:preludeSha,returnedMs:1788686653652});assert.deepEqual(current,previous);return current;
}
export function verifyForensicResult(result,{mode,planId,jobId,metaHash,contextHash,previousEntryHash}){
 assert.equal(result.schema,1);assert.equal(result.mode,mode);assert.equal(result.readOnly,true);assert.equal(result.committed,false);assert.equal(result.planId,planId);assert.equal(result.jobId,jobId);assert.equal(result.checkpoint,78);
 for(const k of ['entryHashBefore','entryHashAfter','metaHashBefore','metaHashAfter'])assert.match(result[k],/^[a-f0-9]{64}$/);assert.equal(result.entryHashBefore,result.entryHashAfter);assert.equal(result.metaHashBefore,metaHash);assert.equal(result.metaHashAfter,metaHash);if(previousEntryHash)assert.equal(result.entryHashBefore,previousEntryHash);
 assert.deepEqual(Object.keys(result.timings).sort(),['admittedMs','bodyMs','totalMs','verifyMs']);for(const n of Object.values(result.timings))assert.ok(Number.isSafeInteger(n)&&n>=0);assert.ok(result.timings.totalMs>=result.timings.bodyMs);
 const phaseNames=mode==='context'?['source-context-get','source-context-check']:['source-context-get','source-context-check','raw-load','raw-byte-check','raw-decode-sort','basis-hash','hydrate','forecast','projection','analysis-commit'];assert.deepEqual(result.phases?.map(p=>`${p.phase}/${p.event}`),phaseNames.flatMap(p=>[`${p}/start`,`${p}/complete`]));assert.ok(Array.isArray(result.phases)&&result.phases.length<=24);for(const row of result.phases){assert.ok(['start','progress','complete','failed'].includes(row.event));assert.ok(Number.isSafeInteger(row.elapsedMs)&&row.elapsedMs>=0);assert.ok(!Object.keys(row).some(k=>!['phase','event','elapsedMs','completedChunks','totalChunks','totalPacks','encodedBytes'].includes(k)));}
 if(mode==='context'){assert.equal(result.hypothetical,undefined);assert.equal(result.context.hash,contextHash);assert.equal(result.context.bytes,979);assert.ok(Number.isSafeInteger(result.context.readMs)&&result.context.readMs>=0);for(const phase of ['source-context-get','source-context-check'])for(const event of ['start','complete'])assert.ok(result.phases.some(p=>p.phase===phase&&p.event===event));}
 else{assert.equal(mode,'analyze');assert.equal(result.context,undefined);const h=result.hypothetical;assert.equal(h.label,'not-committed');assert.equal(h.nextStage,'baseline');assert.equal(h.nextCheckpoint,79);assert.equal(h.commitCount,1);assert.equal(h.writeCount,2);assert.equal(h.prospectiveWrites.length,2);assert.deepEqual(h.prospectiveWrites.map(w=>({role:w.role,keyHash:w.keyHash})).sort((a,b)=>a.keyHash.localeCompare(b.keyHash)),[{role:'checkpoint',keyHash:keyHash(`p:${planId}:report-jobs:entry:${jobId}`)},{role:'private-artifact',keyHash:keyHash(`p:${planId}:report-jobs:data:${jobId}:analysis`)}].sort((a,b)=>a.keyHash.localeCompare(b.keyHash)));for(const w of h.prospectiveWrites){assert.match(w.keyHash,/^[a-f0-9]{64}$/);assert.match(w.valueHash,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(w.bytes)&&w.bytes>0&&w.bytes<=220*1024);}
 for(const phase of ['source-context-get','source-context-check','raw-load','raw-byte-check','raw-decode-sort','basis-hash','hydrate','forecast','projection','analysis-commit'])for(const event of ['start','complete'])assert.ok(result.phases.some(p=>p.phase===phase&&p.event===event),`${phase}/${event} missing`);
 }
 return result;
}
