# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-planning.spec.ts >> targets: real release scope CRUD persists and produces independently bounded 100 versus 0 percent
- Location: scenarios/lz-ppm/journey-campaign-planning.spec.ts:21:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 0

  Array [
    "WFH-2729",
-   "WFH-2730",
  ]
```

# Test source

```ts
  1   | import fs from 'node:fs';
  2   | import { expect } from '../../fixtures/forge';
  3   | import { getTestState } from '../../testhook/client';
  4   | import { openPlan, scheduleFields, LZPT_PLAN, waitForIssueReload } from './forecast-fixture';
  5   | // @ts-ignore REST helpers operate on real, owned wolfaenpak issues.
  6   | import { get, post, put, request, BASE } from '../../data/jira.mjs';
  7   | 
  8   | export type Seed = { label: string; start: string; due: string; duration: number | null; release?: boolean };
  9   | export async function withOwnedSchedule(page: any, info: any, seeds: Seed[], work: (f: any) => Promise<void>, linked = false) {
  10  |   expect(BASE).toBe('https://wolfaenpak.atlassian.net');
  11  |   const before = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  12  |   const registry = (await getTestState('lz-ppm', { what: 'plans' })).plans.map((p: any) => p.id).sort();
  13  |   const fields = (await getTestState('lz-ppm', { what: 'fieldConfig' })).fields;
  14  |   expect(fields).toMatchObject({ startDate: 'customfield_10015', dueDate: 'duedate', duration: 'customfield_10180' });
  15  |   const marker = `lz-norm-${Date.now().toString(36)}`;
  16  |   const name = `[harness-test] ${marker}`;
  17  |   const journal: any = { marker, name, time: new Date().toISOString(), issues: [], planId: null, cleanup: [] };
  18  |   const persist = () => fs.writeFileSync(info.outputPath('fixture-journal.json'), JSON.stringify(journal, null, 2));
  19  |   fs.mkdirSync(info.outputDir, { recursive: true }); persist();
  20  |   const read = async (key: string) => {
  21  |     expect(journal.issues.some((i: any) => i.key === key), 'REST target belongs to this test').toBe(true);
  22  |     const issue = await get(`/rest/api/3/issue/${key}?fields=project,labels,summary,${fields.startDate},${fields.dueDate},${fields.duration}`);
  23  |     expect(issue.fields.project.key).toBe('WFH'); expect(issue.fields.labels).toContain(marker);
  24  |     return { key, start: issue.fields[fields.startDate], due: issue.fields[fields.dueDate], duration: issue.fields[fields.duration] };
  25  |   };
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
  43  |     if (linked) {
  44  |       expect(journal.issues).toHaveLength(2);
  45  |       const types = await get('/rest/api/3/issueLinkType');
  46  |       const type = types.issueLinkTypes.find((t: any) => t.outward.toLowerCase() === 'blocks'); expect(type).toBeTruthy();
  47  |       await post('/rest/api/3/issueLink', { type: { id: type.id }, inwardIssue: { key: journal.issues[0].key }, outwardIssue: { key: journal.issues[1].key } });
  48  |     }
  49  |     const fixtureJql = `key in (${journal.issues.map((i: any) => i.key).join(',')}) ORDER BY Rank ASC`;
  50  |     // Direct GET is strongly visible before Jira's search index necessarily is.
  51  |     // Wait for the exact owned rows and all seeded schedule fields in real JQL.
  52  |     const indexedExpected = journal.issues.map((i:any)=>({key:i.key,start:i.seed.start,due:i.seed.due,duration:i.seed.duration})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  53  |     await expect.poll(async()=>{
  54  |       const indexed = await post('/rest/api/3/search/jql',{jql:fixtureJql,maxResults:100,fields:[fields.startDate,fields.dueDate,fields.duration]});
  55  |       return indexed.issues.map((i:any)=>({key:i.key,start:i.fields[fields.startDate],due:i.fields[fields.dueDate],duration:i.fields[fields.duration]})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  56  |     },{timeout:60000,intervals:[500,1000,2000],message:'new fixture is searchable with complete seeded schedule'}).toEqual(indexedExpected);
  57  |     journal.searchIndexVerified = indexedExpected; persist();
  58  |     const created = await getTestState('lz-ppm', { what: 'createFixture', name, jql: fixtureJql });
  59  |     journal.planId = created.planId; persist();
> 60  |     expect(created.issues.map((i: any) => i.key).sort()).toEqual(journal.issues.map((i: any) => i.key).sort());
      |                                                          ^ Error: expect(received).toEqual(expected) // deep equality
  61  |     for (const i of journal.issues) expect(created.issues.find((r: any) => r.key === i.key)).toMatchObject({ duration: i.seed.duration, startDate: i.seed.start, dueDate: i.seed.due });
  62  |     if (linked) expect(created.issues.find((i: any) => i.key === journal.issues[1].key).predecessors).toContain(journal.issues[0].key);
  63  |     await work({ planId: journal.planId, name, keys: journal.issues.map((i: any) => i.key), read, fields, version: journal.version });
  64  |   } finally {
  65  |     await page.goto('about:blank');
  66  |     if (!journal.planId) journal.planId = (await getTestState('lz-ppm', { what: 'plans' })).plans.find((p: any) => p.name === name)?.id;
  67  |     if (journal.planId) {
  68  |       await getTestState('lz-ppm', { what: 'clearDrafts', planId: journal.planId });
  69  |       await getTestState('lz-ppm', { what: 'deleteFixture', planId: journal.planId });
  70  |       journal.cleanup.push({ plan: journal.planId, deleted: true }); persist();
  71  |     }
  72  |     for (const issue of [...journal.issues].reverse()) {
  73  |       await read(issue.key); // Positive ownership control on this exact issue before delete.
  74  |       await request('DELETE', `/rest/api/3/issue/${issue.key}`);
  75  |       const absent = await request('GET', `/rest/api/3/issue/${issue.key}`, { raw: true });
  76  |       expect(absent.status).toBe(404); journal.cleanup.push({ issue: issue.key, deleted: true }); persist();
  77  |     }
  78  |     if (journal.version) {
  79  |       const version = await get(`/rest/api/3/version/${journal.version.id}`); expect(version.name).toBe(name); expect(version.projectId).toBe(journal.version.projectId);
  80  |       await request('DELETE', `/rest/api/3/version/${journal.version.id}`);
  81  |       expect((await request('GET', `/rest/api/3/version/${journal.version.id}`, {raw:true})).status).toBe(404);
  82  |       journal.cleanup.push({version:journal.version.id,deleted:true});persist();
  83  |     }
  84  |     expect((await getTestState('lz-ppm', { what: 'plans' })).plans.map((p: any) => p.id).sort()).toEqual(registry);
  85  |     expect(scheduleFields((await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN })).issues)).toEqual(scheduleFields(before.issues));
  86  |     journal.integrityPassed = true; persist(); console.log('OWNED_SCHEDULE_CLEANUP', JSON.stringify(journal));
  87  |   }
  88  | }
  89  | 
  90  | export const row = (frame: any, key: string) => frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`);
  91  | export async function table(page: any, name: string) {
  92  |   const frame = await openPlan(page, name);
  93  |   await frame.getByRole('button', { name: /^Table/i }).first().click();
  94  |   await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  95  |   return frame;
  96  | }
  97  | export async function editDuration(frame: any, key: string, value: string) {
  98  |   // Fixed primary columns from TableView: selection,key,summary,start,due,duration.
  99  |   await row(frame, key).locator(':scope > div').nth(5).click();
  100 |   const input = row(frame, key).locator('input[inputmode="numeric"]');
  101 |   await expect(input).toBeVisible(); await input.fill(value); await input.press('Enter');
  102 | }
  103 | export async function save(frame: any) {
  104 |   const button = frame.locator('[data-testid="plan-save-btn"]');
  105 |   await expect(button).toHaveAttribute('data-has-changes', '1'); await button.click();
  106 |   await expect(button).toHaveAttribute('data-has-changes', '0', { timeout: 30_000 });
  107 | }
  108 | export async function refresh(page: any, frame: any, planId: string) {
  109 |   await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
  110 |   const received = waitForIssueReload(page);
  111 |   expect((await getTestState('lz-ppm', { what: 'refreshPlan', planId })).ok).toBe(true);
  112 |   await frame.getByRole('button', { name: /^Table/i }).first().click();
  113 |   expect(await received).toEqual({ ok: true });
  114 |   await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  115 | }
  116 | export async function review(frame: any) {
  117 |   await frame.getByRole('button', { name: /^Apply \d+ change/i }).first().click();
  118 |   const modal = frame.locator('[data-testid="apply-review-modal"]'); await expect(modal).toBeVisible(); return modal;
  119 | }
  120 | export async function discard(frame: any) {
  121 |   const modal = await review(frame); await modal.getByRole('button', { name: 'Discard All', exact: true }).click();
  122 |   await expect(modal).toHaveCount(0);
  123 | }
  124 | export async function snapshot(frame: any, key: string) {
  125 |   const r = row(frame, key); return { duration: await r.getAttribute('data-row-duration'), start: await r.getAttribute('data-row-start'), due: await r.getAttribute('data-row-due') };
  126 | }
  127 | 
```