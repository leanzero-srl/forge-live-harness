# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-history-transaction.spec.ts >> history platform: real entity fence rolls back both KVS mutations and preserves successor lease
- Location: scenarios/lz-ppm/campaign-history-transaction.spec.ts:7:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 5
+ Received  + 1

  Object {
    "acquiredRealEntityLease": true,
    "guardedMixedCommitReadBack": true,
-   "pointerUnchanged": true,
-   "replacementLeaseReadBack": true,
-   "staleCommitRejected": true,
-   "staleFinallyPreservedSuccessor": true,
-   "tombstoneUnchanged": true,
+   "replacementLeaseReadBack": false,
  }
```

# Test source

```ts
  1  | // Platform SDK transaction proof; deliberately no browser or second-user proxy.
  2  | import fs from 'node:fs';
  3  | import {randomUUID} from 'node:crypto';
  4  | import {test,expect} from '@playwright/test';
  5  | import {getTestState} from '../../testhook/client';
  6  | test.describe.configure({retries:0,timeout:120_000});
  7  | test('history platform: real entity fence rolls back both KVS mutations and preserves successor lease',async({},info)=>{
  8  |  const probeId=randomUUID();fs.mkdirSync(info.outputDir,{recursive:true});
  9  |  fs.writeFileSync(info.outputPath('probe-journal.json'),JSON.stringify({probeId,planId:`harness-history-${probeId}`,phase:'requested'},null,2));
  10 |  const before=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();
  11 |  const result=await getTestState('lz-ppm',{what:'historyTransactionProbe',probeId});
  12 |  fs.writeFileSync(info.outputPath('history-transaction-proof.json'),JSON.stringify(result,null,2));
  13 |  await info.attach('real-platform-transaction-proof',{body:JSON.stringify(result),contentType:'application/json'});
  14 |  expect(result.probeId).toBe(probeId);expect(result.planId).toBe(`harness-history-${probeId}`);
> 15 |  expect(result.checks).toEqual({acquiredRealEntityLease:true,guardedMixedCommitReadBack:true,replacementLeaseReadBack:true,staleCommitRejected:true,pointerUnchanged:true,tombstoneUnchanged:true,staleFinallyPreservedSuccessor:true});
     |                        ^ Error: expect(received).toEqual(expected) // deep equality
  16 |  expect(result.reads.positive).toEqual({pointer:{snapshotId:'positive-control'},tombstone:{deleted:false}});expect(result.reads.afterRejected).toEqual(result.reads.positive);
  17 |  expect(result.rejectedCommit.message).toBeTruthy();expect(result.errors).toEqual([]);expect(result.cleanup).toEqual({pointerAbsent:true,tombstoneAbsent:true,entityAbsent:true});expect(result.passed).toBe(true);
  18 |  expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(before);
  19 | });
  20 | 
```