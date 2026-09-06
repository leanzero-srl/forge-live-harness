# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report-numeric.spec.ts >> report analytics: actual capture retains exact seeded quantiles, scoped probabilities and 20h versus 12h overload despite later schedule, effort and profile changes
- Location: scenarios/lz-ppm/journey-campaign-report-numeric.spec.ts:14:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="table-row"][data-row-key="WFH-2853"]').locator('input[inputmode="numeric"]')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="table-row"][data-row-key="WFH-2853"]').locator('input[inputmode="numeric"]')

```

```yaml
- banner:
  - button "LeanZero Management home": LeanZero Management
  - navigation:
    - button "Plans"
    - button "Capacity"
  - text: Portfolio control · rev
  - strong: v4.58.579
- main:
  - button "Back to plans": ←
  - text: "[harness-test] lz-norm-mtp2kesz Ready 1 issue ?"
  - img
  - text: Standard (Mon-Fri)
  - button "JQL":
    - img
    - text: JQL
  - button "Gantt":
    - img
    - text: Gantt
  - button "Table":
    - img
    - text: Table
  - button "Dashboard":
    - img
    - text: Dashboard
  - button "Schedule":
    - img
    - text: Schedule
  - button "Planning"
  - button "Permissions":
    - img
    - text: Permissions
  - button "✦ Assess"
  - text: Live
  - button "Saved" [disabled]
  - button "Delete"
  - button "Re-index"
  - text: "?"
  - button "Assets"
  - button "Configure fields"
  - text: 1 issues
  - img
  - textbox "Filter tasks…"
  - text: Group
  - combobox:
    - text: No grouping
    - img
  - button "Columns":
    - img
    - text: Columns
  - checkbox "Select all visible rows"
  - button "Key"
  - button "Summary"
  - button "Start Date"
  - button "Due Date"
  - button "Duration"
  - button "Buffer"
  - checkbox "Select WFH-2853"
  - text: WFH-2853 [harness-test] lz-norm-mtp2kesz numeric report 20h Sep 7
  - img
  - text: Sep 11
  - img
  - text: 5d No
```

# Test source

```ts
  47  |     if (linkPairs.length) {
  48  |       const types = await get('/rest/api/3/issueLinkType');
  49  |       const type = types.issueLinkTypes.find((t: any) => t.outward.toLowerCase() === 'blocks'); expect(type).toBeTruthy();
  50  |       for (const [from, to] of linkPairs) {
  51  |         expect(Number.isInteger(from) && Number.isInteger(to) && from !== to).toBe(true);
  52  |         expect(journal.issues[from]).toBeTruthy(); expect(journal.issues[to]).toBeTruthy();
  53  |         await post('/rest/api/3/issueLink', { type: { id: type.id }, inwardIssue: { key: journal.issues[from].key }, outwardIssue: { key: journal.issues[to].key } });
  54  |       }
  55  |       journal.linkPairs = linkPairs.map(([from, to]) => ({from:journal.issues[from].key,to:journal.issues[to].key})); persist();
  56  |     }
  57  |     const primaryIssues=primaryIndexes ? primaryIndexes.map(index=>journal.issues[index]) : journal.issues;
  58  |     expect(primaryIssues.length).toBeGreaterThan(0);for(const issue of primaryIssues)expect(issue).toBeTruthy();expect(new Set(primaryIssues.map((i:any)=>i.key)).size).toBe(primaryIssues.length);
  59  |     const fixtureJql = `key in (${primaryIssues.map((i: any) => i.key).join(',')}) ORDER BY Rank ASC`;
  60  |     // Direct GET is strongly visible before Jira's search index necessarily is.
  61  |     // Wait for the exact owned rows and all seeded schedule fields in real JQL.
  62  |     const indexedExpected = primaryIssues.map((i:any)=>({key:i.key,start:i.seed.start,due:i.seed.due,duration:i.seed.duration})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  63  |     await expect.poll(async()=>{
  64  |       const indexed = await post('/rest/api/3/search/jql',{jql:fixtureJql,maxResults:100,fields:[fields.startDate,fields.dueDate,fields.duration]});
  65  |       return indexed.issues.map((i:any)=>({key:i.key,start:i.fields[fields.startDate],due:i.fields[fields.dueDate],duration:i.fields[fields.duration]})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  66  |     },{timeout:60000,intervals:[500,1000,2000],message:'new fixture is searchable with complete seeded schedule'}).toEqual(indexedExpected);
  67  |     journal.searchIndexVerified = indexedExpected; persist();
  68  |     let created = await getTestState('lz-ppm', { what: 'createFixture', name, jql: fixtureJql });
  69  |     journal.planId = created.planId; persist();
  70  |     const indexedShape=(rows:any[])=>rows.map((i:any)=>({key:i.key,start:i.startDate,due:i.dueDate,duration:i.duration})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  71  |     journal.forgeIndexObservations=[indexedShape(created.issues)]; persist();
  72  |     if (JSON.stringify(indexedShape(created.issues)) !== JSON.stringify(indexedExpected)) {
  73  |       // Jira asApp search can lag the external REST reader independently. This
  74  |       // is fixture setup only: refresh the SAME owned plan until complete.
  75  |       await expect.poll(async()=>{
  76  |         await getTestState('lz-ppm',{what:'refreshPlan',planId:journal.planId});
  77  |         const refreshed=await getTestState('lz-ppm',{what:'plan',planId:journal.planId});created={...created,...refreshed};
  78  |         const observation=indexedShape(created.issues);journal.forgeIndexObservations.push(observation);persist();return observation;
  79  |       },{timeout:90000,intervals:[1000,3000,5000],message:'Forge reader sees the complete owned fixture schedule'}).toEqual(indexedExpected);
  80  |     }
  81  |     expect(created.issues.map((i: any) => i.key).sort()).toEqual(primaryIssues.map((i: any) => i.key).sort());
  82  |     for (const i of primaryIssues) expect(created.issues.find((r: any) => r.key === i.key)).toMatchObject({ duration: i.seed.duration, startDate: i.seed.start, dueDate: i.seed.due });
  83  |     for (const [from, to] of linkPairs) expect(created.issues.find((i: any) => i.key === journal.issues[to].key).predecessors).toContain(journal.issues[from].key);
  84  |     await work({ planId: journal.planId, name, retainForRecovery:(error:any,additionalPlans:any[]=[])=>{
  85  |       expect(error?.code).toBe('LZ_CAPACITY_SETTINGS_RECOVERY_REQUIRED');
  86  |       for(const item of additionalPlans){expect(typeof item.id).toBe('string');expect(item.name.startsWith(name+' ')).toBe(true);expect(registry).not.toContain(item.id);}
  87  |       recoveryRetention={reason:error.message,code:error.code,settingsState:error.settingsState,additionalPlans,time:new Date().toISOString()};journal.recoveryRetention=recoveryRetention;persist();
  88  |     }, keys: journal.issues.map((i: any) => i.key), read, fields, version: journal.version });
  89  |   } catch(error) {
  90  |     bodyError=error;journal.bodyError={name:(error as any)?.name,message:String((error as any)?.message||error)};persist();
  91  |   } finally {
  92  |     const cleanupErrors:any[]=[];
  93  |     const attempt=async(stage:string,action:()=>Promise<void>)=>{
  94  |       try{await action();}catch(error){cleanupErrors.push(error);journal.cleanupErrors??=[];journal.cleanupErrors.push({stage,name:(error as any)?.name,message:String((error as any)?.message||error)});persist();}
  95  |     };
  96  |     // Independent owned resources must still be cleaned if a sibling fails.
  97  |     // Every issue retains its own positive ownership check before deletion.
  98  |     await attempt('stop-owned-ui',async()=>{if(!page.isClosed())await page.goto('about:blank').catch(async(error:any)=>{await page.close().catch(()=>{});if(!page.isClosed())throw error;journal.browserAlreadyClosedDuringCleanup=String(error.message);persist();});});
  99  |     if(recoveryRetention){
  100 |       const retainedPlans=[{id:journal.planId,name},...recoveryRetention.additionalPlans];
  101 |       for(const item of retainedPlans)await attempt(`verify-retained-plan:${item.id}`,async()=>{const current=await getTestState('lz-ppm',{what:'plan',planId:item.id});expect(current.meta.name).toBe(item.name);});
  102 |       await attempt('retained-registry-integrity',async()=>{expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual([...registry,...retainedPlans.map(p=>p.id)].sort());});
  103 |       await attempt('standing-source-integrity',async()=>{expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(before.issues));});
  104 |       journal.retainedForRecovery={plans:retainedPlans,issues:journal.issues,version:journal.version||null,reason:recoveryRetention.reason};journal.integrityPassed=false;persist();
  105 |       // Retention is a failed recovery boundary, never successful fixture cleanup.
  106 |       throw new AggregateError([...(bodyError?[bodyError]:[]),...cleanupErrors], 'Capacity settings recovery required; exact owned fixtures retained, cleanup not passed');
  107 |     }
  108 |     await attempt('resolve-owned-plan',async()=>{if(!journal.planId)journal.planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;});
  109 |     if(journal.planId)await attempt('delete-owned-plan',async()=>{
  110 |       await getTestState('lz-ppm',{what:'clearDrafts',planId:journal.planId});
  111 |       await getTestState('lz-ppm',{what:'deleteFixture',planId:journal.planId});
  112 |       journal.cleanup.push({plan:journal.planId,deleted:true});persist();
  113 |     });
  114 |     for(const issue of [...journal.issues].reverse())await attempt(`delete-owned-issue:${issue.key}`,async()=>{
  115 |       await read(issue.key);
  116 |       await request('DELETE',`/rest/api/3/issue/${issue.key}`);
  117 |       const absent=await request('GET',`/rest/api/3/issue/${issue.key}`,{raw:true});
  118 |       expect(absent.status).toBe(404);journal.cleanup.push({issue:issue.key,deleted:true});persist();
  119 |     });
  120 |     if(journal.version)await attempt('delete-owned-version',async()=>{
  121 |       const version=await get(`/rest/api/3/version/${journal.version.id}`);expect(version.name).toBe(name);expect(version.projectId).toBe(journal.version.projectId);
  122 |       await request('DELETE',`/rest/api/3/version/${journal.version.id}`);
  123 |       expect((await request('GET',`/rest/api/3/version/${journal.version.id}`,{raw:true})).status).toBe(404);
  124 |       journal.cleanup.push({version:journal.version.id,deleted:true});persist();
  125 |     });
  126 |     await attempt('registry-integrity',async()=>{expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(registry);});
  127 |     await attempt('standing-source-integrity',async()=>{expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(before.issues));});
  128 |     journal.integrityPassed=cleanupErrors.length===0;persist();console.log('OWNED_SCHEDULE_CLEANUP',JSON.stringify(journal));
  129 |     if(cleanupErrors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...cleanupErrors],'Owned schedule body/cleanup failures; every independent cleanup attempted');
  130 |     if(bodyError)throw bodyError;
  131 |   }
  132 | }
  133 | 
  134 | export const row = (frame: any, key: string) => frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`);
  135 | export async function table(page: any, name: string) {
  136 |   const frame = await openPlan(page, name);
  137 |   await frame.getByRole('button', { name: /^Table/i }).first().click();
  138 |   await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  139 |   await waitForAppReady(frame.locator('[data-testid="table-row"]').first().or(frame.getByText(/^No tasks match /)).first());
  140 |   return frame;
  141 | }
  142 | export async function editDuration(frame: any, key: string, value: string) {
  143 |   await waitForAppReady(row(frame,key));
  144 |   // Fixed primary columns from TableView: selection,key,summary,start,due,duration.
  145 |   await row(frame, key).locator(':scope > div').nth(5).click();
  146 |   const input = row(frame, key).locator('input[inputmode="numeric"]');
> 147 |   await expect(input).toBeVisible(); await input.fill(value); await input.press('Enter');
      |                       ^ Error: expect(locator).toBeVisible() failed
  148 | }
  149 | export async function save(frame: any) {
  150 |   const button = frame.locator('[data-testid="plan-save-btn"]');
  151 |   await expect(button).toHaveAttribute('data-has-changes', '1'); await button.click();
  152 |   await expect(button).toHaveAttribute('data-has-changes', '0', { timeout: 30_000 });
  153 | }
  154 | export async function refresh(page: any, frame: any, planId: string) {
  155 |   await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
  156 |   const received = waitForIssueReload(page);
  157 |   expect((await getTestState('lz-ppm', { what: 'refreshPlan', planId })).ok).toBe(true);
  158 |   await frame.getByRole('button', { name: /^Table/i }).first().click();
  159 |   expect(await received).toEqual({ ok: true });
  160 |   await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  161 | }
  162 | export async function review(frame: any) {
  163 |   await frame.getByRole('button', { name: /^Apply \d+ change/i }).first().click();
  164 |   const modal = frame.locator('[data-testid="apply-review-modal"]'); await expect(modal).toBeVisible(); return modal;
  165 | }
  166 | export async function discard(frame: any) {
  167 |   const modal = await review(frame); await modal.getByRole('button', { name: 'Discard All', exact: true }).click();
  168 |   await expect(modal).toHaveCount(0);
  169 | }
  170 | export async function snapshot(frame: any, key: string) {
  171 |   const r = row(frame, key); return { duration: await r.getAttribute('data-row-duration'), start: await r.getAttribute('data-row-start'), due: await r.getAttribute('data-row-due') };
  172 | }
  173 | 
```