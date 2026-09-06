# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-sensitivity-boundaries.spec.ts >> sensitivity: fixed buffer absorbs predecessor changes and buffer, completed work and declared zero are not directly perturbed
- Location: scenarios/lz-ppm/journey-campaign-sensitivity-boundaries.spec.ts:37:1

# Error details

```
Error: page.setViewportSize: Target page, context or browser has been closed
```

# Test source

```ts
  1   | import { expect } from '../../fixtures/forge';
  2   | import { getTarget } from '../../config/targets';
  3   | import { assertLoggedIn } from '../../forge/browser';
  4   | import { enterForgeSurface } from '../../forge/frame';
  5   | import { getTestState } from '../../testhook/client';
  6   | 
  7   | export const FORECAST_KEYS = ['LZPT-205', 'LZPT-209', 'LZPT-215'];
  8   | export const FORECAST_JQL = `key in (${FORECAST_KEYS.join(',')}) ORDER BY Rank ASC`;
  9   | export const LZPT_PLAN = 'plan-msq9dg8l-gz6mz1';
  10  | const target = getTarget('lz-ppm-dashboard');
  11  | 
  12  | export function scheduleFields(issues: any[]) {
  13  |   return issues.map(({ key, startDate, dueDate, duration, buffer, predecessors, successors, parentKey }: any) =>
  14  |     ({ key, startDate, dueDate, duration, buffer, predecessors, successors, parentKey }))
  15  |     .sort((a, b) => a.key.localeCompare(b.key));
  16  | }
  17  | 
  18  | export async function openPlans(page: any) {
> 19  |   await page.setViewportSize({ width: 1600, height: 1100 });
      |              ^ Error: page.setViewportSize: Target page, context or browser has been closed
  20  |   await assertLoggedIn(page);
  21  |   await page.goto(target.deepLink(target.envId)!, { waitUntil: 'domcontentloaded' });
  22  |   await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first()
  23  |     .waitFor({ state: 'attached', timeout: 30_000 });
  24  |   const surface = await enterForgeSurface(page, { surface: 'custom' });
  25  |   if (surface.kind !== 'custom') throw new Error('No Forge frame');
  26  |   await surface.frame.getByText('LZPT Scenarios', { exact: true }).first().waitFor({ timeout: 60_000 });
  27  |   return surface.frame;
  28  | }
  29  | 
  30  | export async function openPlan(page: any, name: string) {
  31  |   const frame = await openPlans(page);
  32  |   await frame.getByText(name, { exact: true }).first().click();
  33  |   await frame.getByRole('button', { name: /^Dashboard/i }).first().waitFor({ timeout: 60_000 });
  34  |   return frame;
  35  | }
  36  | 
  37  | // Select three genuinely dated Jira leaves: a terminal dependency chain and an
  38  | // early disconnected long task. Indexing may add their ancestor summaries, but
  39  | // must not silently add the invalid/missing-date LZPT siblings. Only a temporary
  40  | // LeanZero plan is created; no Jira issues or source dates are changed.
  41  | export async function withForecastFixture(page: any, label: string, work: (fixture: any) => Promise<any>) {
  42  |   const sourceBefore = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  43  |   let planId: string | undefined;
  44  |   const name = `[harness-test] Forecast proof ${label} ${Date.now().toString(36)}`;
  45  |   try {
  46  |     const created = await getTestState('lz-ppm', { what: 'createFixture', name, jql: FORECAST_JQL });
  47  |     planId = created.planId;
  48  |     expect(planId, 'the temporary plan was created').toBeTruthy();
  49  |     const rows = created.issues || [];
  50  |     const parents = new Set(rows.map((i: any) => i.parentKey).filter(Boolean));
  51  |     const leaves = rows.filter((i: any) => !parents.has(i.key));
  52  |     expect(leaves.map((i: any) => i.key).sort(), 'fixture has exactly the intended valid leaves')
  53  |       .toEqual([...FORECAST_KEYS].sort());
  54  |     for (const i of rows) {
  55  |       expect(i.startDate, `${i.key} start is present`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  56  |       expect(i.dueDate, `${i.key} due is present`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  57  |       expect(i.dueDate >= i.startDate, `${i.key} dates are ordered`).toBe(true);
  58  |     }
  59  |     console.log('FORECAST FIXTURE', JSON.stringify({ planId, name, keys: rows.map((i: any) => i.key).sort() }));
  60  |     return await work({ planId, name, rows });
  61  |   } finally {
  62  |     // Stop the component before clearing its own draft so autosave cannot race
  63  |     // cleanup. Never clear a persistent bed's or another user's drafts.
  64  |     await page.goto('about:blank');
  65  |     if (!planId) {
  66  |       const plans = (await getTestState('lz-ppm', { what: 'plans' })).plans || [];
  67  |       planId = plans.find((p: any) => p.name === name)?.id;
  68  |     }
  69  |     if (planId) {
  70  |       await getTestState('lz-ppm', { what: 'clearDrafts', planId });
  71  |       await getTestState('lz-ppm', { what: 'deleteFixture', planId });
  72  |       const plans = (await getTestState('lz-ppm', { what: 'plans' })).plans || [];
  73  |       expect(plans.some((p: any) => p.id === planId), 'temporary plan was deleted').toBe(false);
  74  |     }
  75  |     const sourceAfter = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  76  |     expect(scheduleFields(sourceAfter.issues), 'persistent LZPT source schedule unchanged')
  77  |       .toEqual(scheduleFields(sourceBefore.issues));
  78  |     expect(sourceAfter.meta.protectionEnabled).toBe(sourceBefore.meta.protectionEnabled);
  79  |     console.log('FORECAST CLEANUP', JSON.stringify({ planId, deleted: !!planId, sourceScheduleUnchanged: true }));
  80  |   }
  81  | }
  82  | 
  83  | export async function finished(card: any, preset = 'medium') {
  84  |   await expect(card).toHaveAttribute('data-uncertainty', preset);
  85  |   await expect(card).toHaveAttribute('data-p90', /^\d{4}-\d{2}-\d{2}$/, { timeout: 90_000 });
  86  |   const result = {
  87  |     p50: await card.getAttribute('data-p50'), p80: await card.getAttribute('data-p80'), p90: await card.getAttribute('data-p90'),
  88  |     runs: Number(await card.getAttribute('data-runs')), leaves: Number(await card.getAttribute('data-leaves')),
  89  |     onBaseline: Number(await card.getAttribute('data-onbaseline')),
  90  |     bars: await card.locator('[data-testid="sc-bar"]').evaluateAll((els: any[]) => els.map((e) => Number(e.getAttribute('data-count')))),
  91  |   };
  92  |   expect(result.p50 <= result.p80 && result.p80 <= result.p90, 'ordered percentiles').toBe(true);
  93  |   expect(result.bars.reduce((a: number, b: number) => a + b, 0), 'every run belongs to one histogram bucket').toBe(result.runs);
  94  |   expect(result.runs).toBe(300);
  95  |   expect(result.leaves).toBe(3);
  96  |   return result;
  97  | }
  98  | 
  99  | export async function selectPreset(frame: any, card: any, prefix: string) {
  100 |   await card.getByRole('combobox').click();
  101 |   await frame.getByRole('option', { name: new RegExp(`^${prefix} `) }).click();
  102 | }
  103 | 
  104 | // A refresh assertion must witness the actual client reload, not merely reread
  105 | // the previous card before the realtime/tab-sync request has completed.
  106 | export function waitForIssueReload(page: any) {
  107 |   return page.waitForResponse((response: any) =>
  108 |     response.status() === 200 && (response.request().postData() || '').includes('getAllIssues'),
  109 |     { timeout: 90_000 }).then(async (response: any) => { await response.finished(); return { ok: true }; })
  110 |     .catch((error: Error) => ({ ok: false, error: error.message }));
  111 | }
  112 | 
```