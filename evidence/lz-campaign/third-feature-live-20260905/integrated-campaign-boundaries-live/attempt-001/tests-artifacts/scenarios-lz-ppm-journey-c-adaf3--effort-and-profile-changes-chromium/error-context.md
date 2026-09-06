# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report-numeric.spec.ts >> report analytics: actual capture retains exact seeded quantiles, scoped probabilities and 20h versus 12h overload despite later schedule, effort and profile changes
- Location: scenarios/lz-ppm/journey-campaign-report-numeric.spec.ts:12:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="table-row"][data-row-key="WFH-2807"]').locator('input[inputmode="numeric"]')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="table-row"][data-row-key="WFH-2807"]').locator('input[inputmode="numeric"]')

```

```yaml
- banner:
  - button "LeanZero Management home": LeanZero Management
  - navigation:
    - button "Plans"
    - button "Capacity"
  - text: Portfolio control · rev
  - strong: v4.58.577
- main:
  - button "Back to plans": ←
  - text: "[harness-test] lz-norm-mtouzba2 Ready 1 issue ?"
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
  - checkbox "Select WFH-2807"
  - text: WFH-2807 [harness-test] lz-norm-mtouzba2 numeric report 20h Sep 7
  - img
  - text: Sep 11
  - img
  - text: 5d No
```

# Test source

```ts
  26  |   try {
  27  |     // Same-project, same-type positive control. Field absence is not null.
  28  |     const control = await get('/rest/api/3/issue/WFH-1990?fields=project,issuetype,customfield_10180,customfield_10015,duedate');
  29  |     expect(control.fields.project.key).toBe('WFH'); expect(control.fields.issuetype.id).toBe('10004');
  30  |     for (const id of [fields.startDate, fields.dueDate, fields.duration]) expect(Object.hasOwn(control.fields, id), id).toBe(true);
  31  |     const meta = await get('/rest/api/3/issue/createmeta/WFH/issuetypes');
  32  |     expect(meta.issueTypes.some((t: any) => t.id === '10004')).toBe(true);
  33  |     if (seeds.some((seed) => seed.release)) {
  34  |       journal.version = await post('/rest/api/3/version', {name, projectId:Number(control.fields.project.id)}); persist();
  35  |       expect(journal.version.name).toBe(name);
  36  |     }
  37  |     for (const seed of seeds) {
  38  |       const created = await post('/rest/api/3/issue', { fields: { project: { key: 'WFH' }, issuetype: { id: '10004' }, summary: `${name} ${seed.label}`, labels: [marker] } });
  39  |       journal.issues.push({ key: created.key, seed }); persist();
  40  |       await put(`/rest/api/3/issue/${created.key}`, { fields: { [fields.startDate]: seed.start, [fields.dueDate]: seed.due, [fields.duration]: seed.duration, ...(seed.release ? {fixVersions:[{id:journal.version.id}]} : {}) } });
  41  |       expect(await read(created.key)).toEqual({ key: created.key, start: seed.start, due: seed.due, duration: seed.duration });
  42  |     }
  43  |     const linkPairs: Array<[number, number]> = linked === true ? [[0, 1]] : linked || [];
  44  |     if (linked === true) expect(journal.issues).toHaveLength(2);
  45  |     if (linkPairs.length) {
  46  |       const types = await get('/rest/api/3/issueLinkType');
  47  |       const type = types.issueLinkTypes.find((t: any) => t.outward.toLowerCase() === 'blocks'); expect(type).toBeTruthy();
  48  |       for (const [from, to] of linkPairs) {
  49  |         expect(Number.isInteger(from) && Number.isInteger(to) && from !== to).toBe(true);
  50  |         expect(journal.issues[from]).toBeTruthy(); expect(journal.issues[to]).toBeTruthy();
  51  |         await post('/rest/api/3/issueLink', { type: { id: type.id }, inwardIssue: { key: journal.issues[from].key }, outwardIssue: { key: journal.issues[to].key } });
  52  |       }
  53  |       journal.linkPairs = linkPairs.map(([from, to]) => ({from:journal.issues[from].key,to:journal.issues[to].key})); persist();
  54  |     }
  55  |     const primaryIssues=primaryIndexes ? primaryIndexes.map(index=>journal.issues[index]) : journal.issues;
  56  |     expect(primaryIssues.length).toBeGreaterThan(0);for(const issue of primaryIssues)expect(issue).toBeTruthy();expect(new Set(primaryIssues.map((i:any)=>i.key)).size).toBe(primaryIssues.length);
  57  |     const fixtureJql = `key in (${primaryIssues.map((i: any) => i.key).join(',')}) ORDER BY Rank ASC`;
  58  |     // Direct GET is strongly visible before Jira's search index necessarily is.
  59  |     // Wait for the exact owned rows and all seeded schedule fields in real JQL.
  60  |     const indexedExpected = primaryIssues.map((i:any)=>({key:i.key,start:i.seed.start,due:i.seed.due,duration:i.seed.duration})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  61  |     await expect.poll(async()=>{
  62  |       const indexed = await post('/rest/api/3/search/jql',{jql:fixtureJql,maxResults:100,fields:[fields.startDate,fields.dueDate,fields.duration]});
  63  |       return indexed.issues.map((i:any)=>({key:i.key,start:i.fields[fields.startDate],due:i.fields[fields.dueDate],duration:i.fields[fields.duration]})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  64  |     },{timeout:60000,intervals:[500,1000,2000],message:'new fixture is searchable with complete seeded schedule'}).toEqual(indexedExpected);
  65  |     journal.searchIndexVerified = indexedExpected; persist();
  66  |     let created = await getTestState('lz-ppm', { what: 'createFixture', name, jql: fixtureJql });
  67  |     journal.planId = created.planId; persist();
  68  |     const indexedShape=(rows:any[])=>rows.map((i:any)=>({key:i.key,start:i.startDate,due:i.dueDate,duration:i.duration})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  69  |     journal.forgeIndexObservations=[indexedShape(created.issues)]; persist();
  70  |     if (JSON.stringify(indexedShape(created.issues)) !== JSON.stringify(indexedExpected)) {
  71  |       // Jira asApp search can lag the external REST reader independently. This
  72  |       // is fixture setup only: refresh the SAME owned plan until complete.
  73  |       await expect.poll(async()=>{
  74  |         await getTestState('lz-ppm',{what:'refreshPlan',planId:journal.planId});
  75  |         const refreshed=await getTestState('lz-ppm',{what:'plan',planId:journal.planId});created={...created,...refreshed};
  76  |         const observation=indexedShape(created.issues);journal.forgeIndexObservations.push(observation);persist();return observation;
  77  |       },{timeout:90000,intervals:[1000,3000,5000],message:'Forge reader sees the complete owned fixture schedule'}).toEqual(indexedExpected);
  78  |     }
  79  |     expect(created.issues.map((i: any) => i.key).sort()).toEqual(primaryIssues.map((i: any) => i.key).sort());
  80  |     for (const i of primaryIssues) expect(created.issues.find((r: any) => r.key === i.key)).toMatchObject({ duration: i.seed.duration, startDate: i.seed.start, dueDate: i.seed.due });
  81  |     for (const [from, to] of linkPairs) expect(created.issues.find((i: any) => i.key === journal.issues[to].key).predecessors).toContain(journal.issues[from].key);
  82  |     await work({ planId: journal.planId, name, keys: journal.issues.map((i: any) => i.key), read, fields, version: journal.version });
  83  |   } finally {
  84  |     // A route/test failure can already have closed the worker. Stopping its UI
  85  |     // is then complete; backend fixture cleanup must still run.
  86  |     if (!page.isClosed()) await page.goto('about:blank').catch(async(error:any)=>{
  87  |       await page.close().catch(()=>{});
  88  |       if (!page.isClosed()) throw error;
  89  |       journal.browserAlreadyClosedDuringCleanup=String(error.message);persist();
  90  |     });
  91  |     if (!journal.planId) journal.planId = (await getTestState('lz-ppm', { what: 'plans' })).plans.find((p: any) => p.name === name)?.id;
  92  |     if (journal.planId) {
  93  |       await getTestState('lz-ppm', { what: 'clearDrafts', planId: journal.planId });
  94  |       await getTestState('lz-ppm', { what: 'deleteFixture', planId: journal.planId });
  95  |       journal.cleanup.push({ plan: journal.planId, deleted: true }); persist();
  96  |     }
  97  |     for (const issue of [...journal.issues].reverse()) {
  98  |       await read(issue.key); // Positive ownership control on this exact issue before delete.
  99  |       await request('DELETE', `/rest/api/3/issue/${issue.key}`);
  100 |       const absent = await request('GET', `/rest/api/3/issue/${issue.key}`, { raw: true });
  101 |       expect(absent.status).toBe(404); journal.cleanup.push({ issue: issue.key, deleted: true }); persist();
  102 |     }
  103 |     if (journal.version) {
  104 |       const version = await get(`/rest/api/3/version/${journal.version.id}`); expect(version.name).toBe(name); expect(version.projectId).toBe(journal.version.projectId);
  105 |       await request('DELETE', `/rest/api/3/version/${journal.version.id}`);
  106 |       expect((await request('GET', `/rest/api/3/version/${journal.version.id}`, {raw:true})).status).toBe(404);
  107 |       journal.cleanup.push({version:journal.version.id,deleted:true});persist();
  108 |     }
  109 |     expect((await getTestState('lz-ppm', { what: 'plans' })).plans.map((p: any) => p.id).sort()).toEqual(registry);
  110 |     expect(scheduleFields((await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN })).issues)).toEqual(scheduleFields(before.issues));
  111 |     journal.integrityPassed = true; persist(); console.log('OWNED_SCHEDULE_CLEANUP', JSON.stringify(journal));
  112 |   }
  113 | }
  114 | 
  115 | export const row = (frame: any, key: string) => frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`);
  116 | export async function table(page: any, name: string) {
  117 |   const frame = await openPlan(page, name);
  118 |   await frame.getByRole('button', { name: /^Table/i }).first().click();
  119 |   await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  120 |   return frame;
  121 | }
  122 | export async function editDuration(frame: any, key: string, value: string) {
  123 |   // Fixed primary columns from TableView: selection,key,summary,start,due,duration.
  124 |   await row(frame, key).locator(':scope > div').nth(5).click();
  125 |   const input = row(frame, key).locator('input[inputmode="numeric"]');
> 126 |   await expect(input).toBeVisible(); await input.fill(value); await input.press('Enter');
      |                       ^ Error: expect(locator).toBeVisible() failed
  127 | }
  128 | export async function save(frame: any) {
  129 |   const button = frame.locator('[data-testid="plan-save-btn"]');
  130 |   await expect(button).toHaveAttribute('data-has-changes', '1'); await button.click();
  131 |   await expect(button).toHaveAttribute('data-has-changes', '0', { timeout: 30_000 });
  132 | }
  133 | export async function refresh(page: any, frame: any, planId: string) {
  134 |   await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
  135 |   const received = waitForIssueReload(page);
  136 |   expect((await getTestState('lz-ppm', { what: 'refreshPlan', planId })).ok).toBe(true);
  137 |   await frame.getByRole('button', { name: /^Table/i }).first().click();
  138 |   expect(await received).toEqual({ ok: true });
  139 |   await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  140 | }
  141 | export async function review(frame: any) {
  142 |   await frame.getByRole('button', { name: /^Apply \d+ change/i }).first().click();
  143 |   const modal = frame.locator('[data-testid="apply-review-modal"]'); await expect(modal).toBeVisible(); return modal;
  144 | }
  145 | export async function discard(frame: any) {
  146 |   const modal = await review(frame); await modal.getByRole('button', { name: 'Discard All', exact: true }).click();
  147 |   await expect(modal).toHaveCount(0);
  148 | }
  149 | export async function snapshot(frame: any, key: string) {
  150 |   const r = row(frame, key); return { duration: await r.getAttribute('data-row-duration'), start: await r.getAttribute('data-row-start'), due: await r.getAttribute('data-row-due') };
  151 | }
  152 | 
```