// The persistent LZPT bed deliberately contains missing/inverted dates. Its
// honest forecast is unavailable. Numeric proof uses an isolated plan containing
// only known valid Jira leaves and their auto-discovered ancestors, not repaired
// or reseeded source data. Normalization is an ordinary regression after its live fix.
import { test, expect } from '../../fixtures/forge';
import { getTestState } from '../../testhook/client';
import { withForecastFixture, openPlan, finished, selectPreset, scheduleFields, LZPT_PLAN, waitForIssueReload } from './forecast-fixture';

test.describe.configure({ retries: 0, timeout: 420_000 });

test('dashboard: schedule confidence computes ordered distributions and replaces presets honestly', async ({ page }, testInfo) => {
  await withForecastFixture(page, 'numbers', async ({ name }: any) => {
    const frame = await openPlan(page, name);
    await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
    const card = frame.locator('[data-testid="schedule-confidence"]');
    const medium = await finished(card);
    console.log('MEDIUM', JSON.stringify(medium));
    await expect(card).toContainText('Medium −15% / +35%');
    await expect(card).toContainText('Not calibrated against historical delivery');
    await expect(card).toContainText('conditional on the model, not delivery guarantees');
    await expect(card).toContainText('Task finish variability');
    await expect(card).toContainText('At least 90% finish by this date');
    await expect(card).toContainText('Simulated finishes by target');
    await expect(card).not.toContainText('WHAT MOVES THE FINISH');
    await expect(card).not.toContainText('chance to make it');
    await expect(card.locator('[data-testid="sc-coverage"]')).toHaveAttribute('data-dated', '3');
    await expect(card.locator('[data-testid="sc-coverage"]')).toHaveAttribute('data-total', '3');
    await expect(card.locator('[data-testid="sc-driver"]')).toHaveCount(3);
    await card.screenshot({ animations: 'disabled', path: testInfo.outputPath('forecast-medium.png') });

    const bar = card.locator('[data-testid="sc-bar"]').first();
    await bar.hover();
    await expect(card.locator('[role="status"]')).toContainText('finish in this 7-day window');
    await selectPreset(frame, card, 'High');
    const high = await finished(card, 'high');
    console.log('HIGH', JSON.stringify(high));
    await expect(card).toContainText('High −20% / +60%');
    expect(high.p90 >= medium.p90).toBe(true);
    expect(high.p90 > high.p50, 'multi-day terminal task produces a genuine finish range').toBe(true);
    await card.screenshot({ animations: 'disabled', path: testInfo.outputPath('forecast-high.png') });

    // Observe real renders during fast preset replacements. A displayed P90 may
    // never belong to a different preset from the visible custom Select label.
    await card.evaluate((el: any) => {
      const samples: any[] = [];
      const capture = () => samples.push({ p90: el.getAttribute('data-p90'), preset: el.getAttribute('data-uncertainty'), label: el.querySelector('[role="combobox"]')?.textContent || '' });
      const observer = new MutationObserver(capture);
      observer.observe(el, { subtree: true, attributes: true, childList: true, characterData: true });
      el.__forecastProbe = { samples, observer }; capture();
    });
    await selectPreset(frame, card, 'Low');
    await selectPreset(frame, card, 'High');
    await selectPreset(frame, card, 'Low');
    const low = await finished(card, 'low');
    const samples = await card.evaluate((el: any) => { el.__forecastProbe.observer.disconnect(); return el.__forecastProbe.samples; });
    expect(samples.length, 'replacement renders were observed').toBeGreaterThan(0);
    for (const sample of samples) {
      if (sample.p90) expect(sample.label.trim().toLowerCase().startsWith(sample.preset), JSON.stringify(sample)).toBe(true);
    }
    expect(samples.some((s: any) => !s.p90), 'old results were hidden during replacement').toBe(true);
    await expect(card).toContainText('Low −10% / +15%');
    console.log('LOW AFTER RAPID REPLACEMENT', JSON.stringify(low), 'observed renders', samples.length);
    await testInfo.attach('preset-replacement-observations', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
    await card.screenshot({ animations: 'disabled', path: testInfo.outputPath('forecast-low-final.png') });
  });
});

test('dashboard: a background refresh cannot turn the card into false certainty', async ({ page }, testInfo) => {
  await withForecastFixture(page, 'refresh', async ({ name, planId }: any) => {
    const frame = await openPlan(page, name);
    await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
    const card = frame.locator('[data-testid="schedule-confidence"]');
    const before = await finished(card);
    await frame.getByRole('button', { name: /^Table/i }).first().click();
    const reloaded = waitForIssueReload(page);
    const refreshed = await getTestState('lz-ppm', { what: 'refreshPlan', planId });
    expect(refreshed.ok, 'real backend refresh succeeded').toBe(true);
    await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
    expect(await reloaded, 'the open client fetched the refreshed issue snapshot').toEqual({ ok: true });
    await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
    const after = await finished(card);
    console.log('BEFORE / AFTER REFRESH', JSON.stringify({ before, after }));
    expect(after.p90 > after.p50, 'raw-duration reload must retain a distribution').toBe(true);
    expect(after.onBaseline).toBeLessThan(1);
    expect(after.p50).toBe(before.p50);
    await card.screenshot({ animations: 'disabled', path: testInfo.outputPath('forecast-after-refresh.png') });
  });
});

test('dashboard: invalid or missing source dates make the untouched LZPT forecast unavailable', async ({ page }, testInfo) => {
  const before = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  const parents = new Set(before.issues.map((i: any) => i.parentKey).filter(Boolean));
  const missing = before.issues.filter((i: any) => !parents.has(i.key) && (!i.startDate || !i.dueDate)).map((i: any) => i.key);
  const inverted = before.issues.filter((i: any) => i.startDate && i.dueDate && i.startDate > i.dueDate).map((i: any) => i.key);
  expect(missing.length, 'the bed contains a deliberate missing-date leaf').toBeGreaterThan(0);
  expect(inverted, 'the deliberate inverted issue remains in the bed').toContain('LZPT-214');
  try {
    const frame = await openPlan(page, 'LZPT Scenarios');
    await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
    const card = frame.locator('[data-testid="schedule-confidence"]');
    const coverage = card.locator('[data-testid="sc-coverage"]');
    await expect(coverage).toContainText('Forecast unavailable — correct the schedule dates first.');
    await expect(coverage).toContainText('Due date before start');
    await expect(coverage).toContainText('Missing start or due date');
    for (const key of [...missing, ...inverted]) await expect(coverage).toContainText(key);
    for (const attr of ['data-p50', 'data-p80', 'data-p90', 'data-runs', 'data-leaves', 'data-onbaseline']) await expect(card).toHaveAttribute(attr, '');
    await expect(card.locator('[data-testid="sc-planned"]')).toHaveCount(0);
    await expect(card.locator('[data-testid="sc-bar"]')).toHaveCount(0);
    await expect(card.locator('[data-testid="schedule-confidence-progress"]')).toHaveCount(0);
    await selectPreset(frame, card, 'High');
    await expect(coverage).toContainText('Forecast unavailable');
    await expect(card).toHaveAttribute('data-p90', '');
    console.log('INVALID COVERAGE', await coverage.innerText());
    await card.screenshot({ animations: 'disabled', path: testInfo.outputPath('forecast-unavailable-lzpt.png') });
  } finally {
    await page.goto('about:blank');
    const after = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
    expect(scheduleFields(after.issues), 'unavailable state does not repair or change source data').toEqual(scheduleFields(before.issues));
  }
});

test('table: a background refresh must not un-normalize the durations', async ({ page }, testInfo) => {
  // The original expected-failure witness unexpectedly passed on development
  // 4.58.572 / Forge 6.1.0 with setup and cleanup intact. This ordinary guard
  // retains that refresh path and additionally waits for stable visible rows.
  let before: any, after: any;
  await withForecastFixture(page, 'normalization', async ({ name, planId }: any) => {
    const frame = await openPlan(page, name);
    const read = async (navigate = true) => {
      if (navigate) await frame.getByRole('button', { name: /^Table/i }).first().click();
      const out: Record<string, string | null> = {};
      for (const key of ['LZPT-215', 'LZPT-209']) {
        // data-testid and data-row-key are on the SAME node.
        const sameRow = frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`);
        await sameRow.waitFor({ state: 'visible', timeout: 30_000 });
        out[key] = await sameRow.getAttribute('data-row-duration');
      }
      return out;
    };
    await frame.getByRole('button', { name: /^Table/i }).first().click();
    await expect(frame.locator('[data-row-key="LZPT-215"]')).toHaveAttribute('data-row-duration', '42', { timeout: 30_000 });
    await expect(frame.locator('[data-row-key="LZPT-209"]')).toHaveAttribute('data-row-duration', '6');
    before = await read();
    await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
    const reloaded = waitForIssueReload(page);
    const refreshed = await getTestState('lz-ppm', { what: 'refreshPlan', planId });
    expect(refreshed.ok, 'refresh is a genuine successful operation').toBe(true);
    await frame.getByRole('button', { name: /^Table/i }).first().click();
    expect(await reloaded, 'the open client fetched the refreshed issue snapshot').toEqual({ ok: true });
    await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
    let stable = 0;
    await expect.poll(async () => {
      const current = await read(false);
      stable = JSON.stringify(current) === JSON.stringify(before) ? stable + 1 : 0;
      return stable >= 3 ? current : null;
    }, {timeout:45_000,intervals:[1000]}).toEqual(before);
    after = await read(false);
    console.log('NORMALIZATION DURATIONS', JSON.stringify({ before, after }));
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('normalization-after-refresh.png'), fullPage: true });
  });
  expect(after, 'the refresh must not un-normalize the durations').toEqual(before);
});
