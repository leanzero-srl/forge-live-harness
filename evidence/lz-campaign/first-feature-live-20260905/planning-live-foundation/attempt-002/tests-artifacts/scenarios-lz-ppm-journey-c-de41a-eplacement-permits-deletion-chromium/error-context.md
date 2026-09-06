# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-planning.spec.ts >> history: captures retain schedules, active baseline cannot be deleted, replacement permits deletion
- Location: scenarios/lz-ppm/journey-campaign-planning.spec.ts:49:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 3
+ Received  + 1

- Array [
-   "WFH-2719",
- ]
+ Array []
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
  49  |     const created = await getTestState('lz-ppm', { what: 'createFixture', name, jql: `key in (${journal.issues.map((i: any) => i.key).join(',')}) ORDER BY Rank ASC` });
  50  |     journal.planId = created.planId; persist();
> 51  |     expect(created.issues.map((i: any) => i.key).sort()).toEqual(journal.issues.map((i: any) => i.key).sort());
      |                                                          ^ Error: expect(received).toEqual(expected) // deep equality
  52  |     for (const i of journal.issues) expect(created.issues.find((r: any) => r.key === i.key)).toMatchObject({ duration: i.seed.duration, startDate: i.seed.start, dueDate: i.seed.due });
  53  |     if (linked) expect(created.issues.find((i: any) => i.key === journal.issues[1].key).predecessors).toContain(journal.issues[0].key);
  54  |     await work({ planId: journal.planId, name, keys: journal.issues.map((i: any) => i.key), read, fields, version: journal.version });
  55  |   } finally {
  56  |     await page.goto('about:blank');
  57  |     if (!journal.planId) journal.planId = (await getTestState('lz-ppm', { what: 'plans' })).plans.find((p: any) => p.name === name)?.id;
  58  |     if (journal.planId) {
  59  |       await getTestState('lz-ppm', { what: 'clearDrafts', planId: journal.planId });
  60  |       await getTestState('lz-ppm', { what: 'deleteFixture', planId: journal.planId });
  61  |       journal.cleanup.push({ plan: journal.planId, deleted: true }); persist();
  62  |     }
  63  |     for (const issue of [...journal.issues].reverse()) {
  64  |       await read(issue.key); // Positive ownership control on this exact issue before delete.
  65  |       await request('DELETE', `/rest/api/3/issue/${issue.key}`);
  66  |       const absent = await request('GET', `/rest/api/3/issue/${issue.key}`, { raw: true });
  67  |       expect(absent.status).toBe(404); journal.cleanup.push({ issue: issue.key, deleted: true }); persist();
  68  |     }
  69  |     if (journal.version) {
  70  |       const version = await get(`/rest/api/3/version/${journal.version.id}`); expect(version.name).toBe(name); expect(version.projectId).toBe(journal.version.projectId);
  71  |       await request('DELETE', `/rest/api/3/version/${journal.version.id}`);
  72  |       expect((await request('GET', `/rest/api/3/version/${journal.version.id}`, {raw:true})).status).toBe(404);
  73  |       journal.cleanup.push({version:journal.version.id,deleted:true});persist();
  74  |     }
  75  |     expect((await getTestState('lz-ppm', { what: 'plans' })).plans.map((p: any) => p.id).sort()).toEqual(registry);
  76  |     expect(scheduleFields((await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN })).issues)).toEqual(scheduleFields(before.issues));
  77  |     journal.integrityPassed = true; persist(); console.log('OWNED_SCHEDULE_CLEANUP', JSON.stringify(journal));
  78  |   }
  79  | }
  80  | 
  81  | export const row = (frame: any, key: string) => frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`);
  82  | export async function table(page: any, name: string) {
  83  |   const frame = await openPlan(page, name);
  84  |   await frame.getByRole('button', { name: /^Table/i }).first().click();
  85  |   return frame;
  86  | }
  87  | export async function editDuration(frame: any, key: string, value: string) {
  88  |   // Fixed primary columns from TableView: selection,key,summary,start,due,duration.
  89  |   await row(frame, key).locator(':scope > div').nth(5).click();
  90  |   const input = row(frame, key).locator('input[inputmode="numeric"]');
  91  |   await expect(input).toBeVisible(); await input.fill(value); await input.press('Enter');
  92  | }
  93  | export async function save(frame: any) {
  94  |   const button = frame.locator('[data-testid="plan-save-btn"]');
  95  |   await expect(button).toHaveAttribute('data-has-changes', '1'); await button.click();
  96  |   await expect(button).toHaveAttribute('data-has-changes', '0', { timeout: 30_000 });
  97  | }
  98  | export async function refresh(page: any, frame: any, planId: string) {
  99  |   await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
  100 |   const received = waitForIssueReload(page);
  101 |   expect((await getTestState('lz-ppm', { what: 'refreshPlan', planId })).ok).toBe(true);
  102 |   await frame.getByRole('button', { name: /^Table/i }).first().click();
  103 |   expect(await received).toEqual({ ok: true });
  104 |   await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  105 | }
  106 | export async function review(frame: any) {
  107 |   await frame.getByRole('button', { name: /^Apply \d+ change/i }).first().click();
  108 |   const modal = frame.locator('[data-testid="apply-review-modal"]'); await expect(modal).toBeVisible(); return modal;
  109 | }
  110 | export async function discard(frame: any) {
  111 |   const modal = await review(frame); await modal.getByRole('button', { name: 'Discard All', exact: true }).click();
  112 |   await expect(modal).toHaveCount(0);
  113 | }
  114 | export async function snapshot(frame: any, key: string) {
  115 |   const r = row(frame, key); return { duration: await r.getAttribute('data-row-duration'), start: await r.getAttribute('data-row-start'), due: await r.getAttribute('data-row-due') };
  116 | }
  117 | 
```