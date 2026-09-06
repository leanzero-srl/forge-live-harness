// Platform SDK transaction proof; deliberately no browser or second-user proxy.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {getTestState} from '../../testhook/client';
test.describe.configure({retries:0,timeout:120_000});
test('history platform: real entity fence rolls back both KVS mutations and preserves successor lease',async({},info)=>{
 const probeId=randomUUID();fs.mkdirSync(info.outputDir,{recursive:true});
 fs.writeFileSync(info.outputPath('probe-journal.json'),JSON.stringify({probeId,planId:`harness-history-${probeId}`,phase:'requested'},null,2));
 const before=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();
 const result=await getTestState('lz-ppm',{what:'historyTransactionProbe',probeId});
 fs.writeFileSync(info.outputPath('history-transaction-proof.json'),JSON.stringify(result,null,2));
 await info.attach('real-platform-transaction-proof',{body:JSON.stringify(result),contentType:'application/json'});
 expect(result.probeId).toBe(probeId);expect(result.planId).toBe(`harness-history-${probeId}`);
 expect(result.checks).toEqual({acquiredRealEntityLease:true,guardedMixedCommitReadBack:true,replacementLeaseReadBack:true,staleCommitRejected:true,pointerUnchanged:true,tombstoneUnchanged:true,staleFinallyPreservedSuccessor:true});
 expect(result.reads.positive).toEqual({pointer:{snapshotId:'positive-control'},tombstone:{deleted:false}});expect(result.reads.afterRejected).toEqual(result.reads.positive);
 expect(result.rejectedCommit.message).toBeTruthy();expect(result.errors).toEqual([]);expect(result.cleanup).toEqual({pointerAbsent:true,tombstoneAbsent:true,entityAbsent:true});expect(result.passed).toBe(true);
 expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(before);
});
