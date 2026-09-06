import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createRollingReadBudget} from '../../scenarios/lz-ppm/rolling-read-budget.mjs';
const reservations=JSON.parse(fs.readFileSync(new URL('./advance-reservations.json',import.meta.url)));
test('complete remaining57 modeled cycles plus full admission/106pages/export/reopen/finalaudits stay within shared3000/61s',async()=>{let t=0;const events=[],b=createRollingReadBudget({now:()=>t,sleep:async ms=>{t+=ms;},onEvent:e=>events.push({...e})});const op=async(label,cost,latency=500)=>b.run(label,cost,async()=>{t+=latency;});
 await op('bootstrap outstanding',3000,30000);await op('quiet window gate',1,0);
 for(const cost of [640,64,640,512,1024,64,64,64,64,64,64,64,64,64,64])await op('admission',cost);
 for(const row of reservations.remainingAfter126){await op(`advance ${row.from}`,row.reservedUnits,2000);await op('saved status',64,300);await op('full physical',1024,5000);}
 await op('summary',128);for(let i=0;i<3*106;i++)await op('allpages direct/export/reopen',16,300);
 // Additional UI traffic is charged too; this is an explicit model, not an assertion of observed productioncall count.
 for(let i=0;i<40;i++)await op('UI read',64);for(let i=0;i<6;i++)await op('UI fullplan',640);
 for(const cost of [1024,512,640,64,640,64,64,64,64,64,64,64,64,64])await op('final audit',cost);
 const returned=new Map();let max=0;for(const e of events){if(e.stage==='budget-start'){let used=0;for(const prev of events.filter(x=>x.stage==='budget-start'&&x.id<=e.id)){const end=returned.get(prev.id);if(end===undefined||e.startedMs<end+61000)used+=prev.cost;}max=Math.max(max,used);assert.ok(used<=3000,`${e.label} charges ${used}`);}if(e.stage==='budget-return')returned.set(e.id,e.returnedMs);}
 assert.ok(t<7200000);assert.ok(max<=3000);console.log(JSON.stringify({mode:'clock-injected fullremaining model',remainingAdvances:57,allPageReads:318,elapsedMs:t,maxReservedUnits:max,windowMs:61000,guaranteesUnpacedProductThroughput:false}));});
