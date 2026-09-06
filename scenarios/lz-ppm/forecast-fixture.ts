import {beforeReportNavigation} from './report-departure';
import { expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { assertLoggedIn } from '../../forge/browser';
import { enterForgeSurface } from '../../forge/frame';
import { getTestState } from '../../testhook/client';

export const FORECAST_KEYS = ['LZPT-205', 'LZPT-209', 'LZPT-215'];
export const FORECAST_JQL = `key in (${FORECAST_KEYS.join(',')}) ORDER BY Rank ASC`;
export const LZPT_PLAN = 'plan-msq9dg8l-gz6mz1';
const target = getTarget('lz-ppm-dashboard');

export function scheduleFields(issues: any[]) {
  return issues.map(({ key, startDate, dueDate, duration, buffer, predecessors, successors, parentKey }: any) =>
    ({ key, startDate, dueDate, duration, buffer, predecessors, successors, parentKey }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function openPlans(page: any) {
  await beforeReportNavigation(page);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(target.deepLink(target.envId)!, { waitUntil: 'domcontentloaded' });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first()
    .waitFor({ state: 'attached', timeout: 30_000 });
  const surface = await enterForgeSurface(page, { surface: 'custom' });
  if (surface.kind !== 'custom') throw new Error('No Forge frame');
  await surface.frame.getByText('LZPT Scenarios', { exact: true }).first().waitFor({ timeout: 60_000 });
  return surface.frame;
}

export async function openPlan(page: any, name: string) {
  const frame = await openPlans(page);
  await frame.getByText(name, { exact: true }).first().click();
  await frame.getByRole('button', { name: /^Dashboard/i }).first().waitFor({ timeout: 60_000 });
  return frame;
}

// Select three genuinely dated Jira leaves: a terminal dependency chain and an
// early disconnected long task. Indexing may add their ancestor summaries, but
// must not silently add the invalid/missing-date LZPT siblings. Only a temporary
// LeanZero plan is created; no Jira issues or source dates are changed.
export async function withForecastFixture(page: any, label: string, work: (fixture: any) => Promise<any>) {
  const sourceBefore = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  let planId: string | undefined;
  const name = `[harness-test] Forecast proof ${label} ${Date.now().toString(36)}`;
  try {
    const created = await getTestState('lz-ppm', { what: 'createFixture', name, jql: FORECAST_JQL });
    planId = created.planId;
    expect(planId, 'the temporary plan was created').toBeTruthy();
    const rows = created.issues || [];
    const parents = new Set(rows.map((i: any) => i.parentKey).filter(Boolean));
    const leaves = rows.filter((i: any) => !parents.has(i.key));
    expect(leaves.map((i: any) => i.key).sort(), 'fixture has exactly the intended valid leaves')
      .toEqual([...FORECAST_KEYS].sort());
    for (const i of rows) {
      expect(i.startDate, `${i.key} start is present`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(i.dueDate, `${i.key} due is present`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(i.dueDate >= i.startDate, `${i.key} dates are ordered`).toBe(true);
    }
    console.log('FORECAST FIXTURE', JSON.stringify({ planId, name, keys: rows.map((i: any) => i.key).sort() }));
    return await work({ planId, name, rows });
  } finally {
    // Stop the component before clearing its own draft so autosave cannot race
    // cleanup. Never clear a persistent bed's or another user's drafts.
    await page.goto('about:blank');
    if (!planId) {
      const plans = (await getTestState('lz-ppm', { what: 'plans' })).plans || [];
      planId = plans.find((p: any) => p.name === name)?.id;
    }
    if (planId) {
      await getTestState('lz-ppm', { what: 'clearDrafts', planId });
      await getTestState('lz-ppm', { what: 'deleteFixture', planId });
      const plans = (await getTestState('lz-ppm', { what: 'plans' })).plans || [];
      expect(plans.some((p: any) => p.id === planId), 'temporary plan was deleted').toBe(false);
    }
    const sourceAfter = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
    expect(scheduleFields(sourceAfter.issues), 'persistent LZPT source schedule unchanged')
      .toEqual(scheduleFields(sourceBefore.issues));
    expect(sourceAfter.meta.protectionEnabled).toBe(sourceBefore.meta.protectionEnabled);
    console.log('FORECAST CLEANUP', JSON.stringify({ planId, deleted: !!planId, sourceScheduleUnchanged: true }));
  }
}

export async function finished(card: any, preset = 'medium') {
  await expect(card).toHaveAttribute('data-uncertainty', preset);
  await expect(card).toHaveAttribute('data-p90', /^\d{4}-\d{2}-\d{2}$/, { timeout: 90_000 });
  const result = {
    p50: await card.getAttribute('data-p50'), p80: await card.getAttribute('data-p80'), p90: await card.getAttribute('data-p90'),
    runs: Number(await card.getAttribute('data-runs')), leaves: Number(await card.getAttribute('data-leaves')),
    onBaseline: Number(await card.getAttribute('data-onbaseline')),
    bars: await card.locator('[data-testid="sc-bar"]').evaluateAll((els: any[]) => els.map((e) => Number(e.getAttribute('data-count')))),
  };
  expect(result.p50 <= result.p80 && result.p80 <= result.p90, 'ordered percentiles').toBe(true);
  expect(result.bars.reduce((a: number, b: number) => a + b, 0), 'every run belongs to one histogram bucket').toBe(result.runs);
  expect(result.runs).toBe(300);
  expect(result.leaves).toBe(3);
  return result;
}

export async function selectPreset(frame: any, card: any, prefix: string) {
  await card.getByRole('combobox').click();
  await frame.getByRole('option', { name: new RegExp(`^${prefix} `) }).click();
}

// A refresh assertion must witness the actual client reload, not merely reread
// the previous card before the realtime/tab-sync request has completed.
export function waitForIssueReload(page: any) {
  return page.waitForResponse((response: any) =>
    response.status() === 200 && (response.request().postData() || '').includes('getAllIssues'),
    { timeout: 90_000 }).then(async (response: any) => { await response.finished(); return { ok: true }; })
    .catch((error: Error) => ({ ok: false, error: error.message }));
}
