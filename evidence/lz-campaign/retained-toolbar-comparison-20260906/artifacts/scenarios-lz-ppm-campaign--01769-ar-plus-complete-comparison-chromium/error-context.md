# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-toolbar-comparison-visual.spec.ts >> read-only retained ordinary and private toolbar plus complete comparison
- Location: scenarios/lz-ppm/campaign-toolbar-comparison-visual.spec.ts:6:1

# Error details

```
AssertionError: Subject must be painted and unobscured
```

# Test source

```ts
  1  | import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
  2  | const root='/Users/mihaiperdum/Projects/forge-live-harness/evidence/lz-campaign/retained-uat-reuse-20260906';
  3  | export const visualPins={journal:[`${root}/artifacts/scenarios-lz-ppm-journey-c-f9dc4-d-immutable-sponsor-handoff-chromium/retained-uat-journal.json`,'ba69c5dad8d735ee1fd2ee23adbd1befd9f1432b034e97a97fdb291f40d6adb2'],terminal:[`${root}/terminal-receipt.json`,'8d9534a1de8cc4f9bf67717e6f34876a8a7eb8e9e8a10f8ebc3826bfd31b96ab'],audit:[`${root}/final-readonly.json`,'83ae5aba81b447c3446c8ca6899e228fa9b21e110b1b1c3fe1375fae0f91073a']};
  4  | export function loadVisualReceipt(){const out={};for(const [name,[file,digest]]of Object.entries(visualPins)){const raw=fs.readFileSync(file);assert.equal(createHash('sha256').update(raw).digest('hex'),digest);out[name]=JSON.parse(raw);}assert.equal(out.journal.state,'retained');assert.equal(out.journal.noPendingDrafts,true);assert.equal(out.journal.privateSettingsRestored,true);assert.equal(out.terminal.status,'closed');assert.deepEqual(out.terminal.alivePids,[]);assert.equal(out.audit.complete,true);return out;}
  5  | export function visibleGeometry(g){assert.ok(g?.host,'Main page geometry required');for(const box of [g,g.host])checkGeometry(box);return g;}
> 6  | function checkGeometry(g){assert.ok(g&&g.visible===true&&g.clear===true,'Subject must be painted and unobscured');assert.ok(g.width>0&&g.height>0&&g.top>=0&&g.left>=0&&g.bottom<=g.viewportHeight&&g.right<=g.viewportWidth,'Complete short subject must fit its viewport');return g;}
     |                                  ^ AssertionError: Subject must be painted and unobscured
  7  | export const visualReads=new Set(['listPlans','getPlan','getSimulationModel','getAllIssues','getIssues','getIssue','getIndexingProgress','getLockStatus','getDraft','getActiveDrafts','getBaseline','checkUserRole','getTargets','listSnapshots','getSnapshot','listSponsorReports','getSponsorReport','getPresence','presenceBeat','presenceLeave','getNotifications','getCapacitySettings','getPlanCalendar','getWriteProgress','checkConflicts','checkDraftOverlaps','getWritability','getPlanAssets','getAssetsFields','getPlanVersion','getPlanSchedule','getConfig','getAiConfig','getFieldConfig','getCalculationResult','listForecastEvaluations','listForecastObservations']);
  8  | export function visualCall(call,planId){assert.ok(call&&visualReads.has(call.functionKey),'Unexpected operation in read-only witness');const p=call.payload||{};assert.ok(!p.planId||(Array.isArray(planId)?planId:[planId]).includes(p.planId),'Unexpected mounted plan');const payload={};for(const key of ['planId','snapshotId','reportId','section','page','cursor','labelOffset','issueKeys'])if(Object.hasOwn(p,key))payload[key]=structuredClone(p[key]);return {functionKey:call.functionKey,payload};}
  9  | 
  10 | export const privatePin=['/Users/mihaiperdum/Projects/forge-live-harness/evidence/lz-campaign/private-retained-acceptance-20260906/artifacts/scenarios-lz-ppm-campaign--bee9c-eanup-unchanged-shared-Jira-chromium/private-report-witness.json','0b2fd40ff74d3b1b6b7cb067a0f261144303808117a896922beb8727bf956f74'];
  11 | export function loadPrivateReceipt(){const raw=fs.readFileSync(privatePin[0]);assert.equal(createHash('sha256').update(raw).digest('hex'),privatePin[1]);const r=JSON.parse(raw);assert.equal(r.completed,true);assert.equal(r.state,'completed');assert.equal(r.retentionMode,'retain');assert.equal(r.integrityPreserved,true);assert.deepEqual(r.retained,{sourcePlanId:r.source.meta.id,snapshotId:r.snapshot.id,snapshotHash:r.snapshot.hash,privatePlanId:r.owner.planId,generationId:r.owner.plan.simulationGeneration,reportId:r.report.id,reportHash:r.report.hash,jobId:r.finalJob.id,checkpoint:r.finalJob.checkpoint,settingsVersion:r.settings.version});return r;}
  12 | export function headerInvariant(state){const {groups,bounds,width,buttons,title}=state;assert.equal(groups.length,3);for(const box of [title,bounds,...groups,...buttons.map(x=>x.box)])visibleGeometry(box);const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)assert.equal(overlaps(groups[i],groups[j]),false,'Toolbar groups overlap');assert.ok(title.text&&title.scrollWidth<=title.clientWidth+1,'Full title must be visible');assert.ok(title.left>=groups[0].left&&title.right<=groups[0].right&&title.top>=groups[0].top&&title.bottom<=groups[0].bottom,'Title must fit info group');assert.equal(overlaps(title,groups[1])||overlaps(title,groups[2]),false,'Title overlaps tabs or actions');const center=(groups[1].left+groups[1].right)/2;assert.ok(Math.abs(center-(bounds.left+bounds.right)/2)<=1,'Tabs must remain centered');if(width<=1200)assert.ok(groups[1].top>=Math.max(groups[0].bottom,groups[2].bottom)-1,'Constrained tabs require separate row');for(const box of groups)assert.ok(box.left>=bounds.left&&box.right<=bounds.right&&box.top>=bounds.top&&box.bottom<=bounds.bottom);return{...state,center};}
  13 | 
```