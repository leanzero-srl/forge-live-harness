// Independent real UI companions. All Jira writes are on journaled WFH issues;
// the seeded LZPT schedule and retained Assets fixture are never edited.
import { test, expect } from '../../fixtures/forge';
import { getTestState } from '../../testhook/client';
import { withOwnedSchedule, table, row, editDuration, save, refresh, review, discard, snapshot } from './normalization-owned-fixture';

test.describe.configure({ retries: 0, timeout: 600_000 });
const seed = (label: string, duration: number | null, start = '2026-10-05', due = '2026-10-09') => ({ label, start, due, duration });

test('normalization: declared zero survives dependency movement, Save/reopen, refresh and Discard', async ({ page }, info) => {
  await withOwnedSchedule(page, info, [seed('predecessor', 2, '2026-10-05', '2026-10-06'), seed('declared zero', 0, '2026-10-07', '2026-10-07')], async (f) => {
    const [predecessor, milestone] = f.keys;
    let frame = await table(page, f.name);
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '0');
    await expect(row(frame, milestone).locator(':scope > div').nth(5)).toHaveText('0d');
    await refresh(page, frame, f.planId);
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '0');
    await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes', '0');
    await editDuration(frame, predecessor, '4');
    await expect(row(frame, predecessor)).toHaveAttribute('data-row-due', '2026-10-08');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-start', '2026-10-09');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '0');
    await save(frame);
    frame = await table(page, f.name);
    await expect(row(frame, milestone)).toHaveAttribute('data-row-start', '2026-10-09');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '0');
    expect(await f.read(milestone)).toEqual({ key: milestone, start: '2026-10-07', due: '2026-10-07', duration: 0 });
    await info.attach('saved-zero-source', { body: JSON.stringify((await getTestState('lz-ppm', { what: 'plan', planId: f.planId })).issues), contentType: 'application/json' });
    await discard(frame);
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '0');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-start', '2026-10-07');
    await expect(row(frame, predecessor)).toHaveAttribute('data-row-duration', '2');
    // A positive-duration edit to the zero itself is deliberate work. Discard
    // must restore the independently retained zero declaration, not derive 1.
    await editDuration(frame, milestone, '2');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '2');
    await discard(frame);
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '0');
    frame = await table(page, f.name);
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '0');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-start', '2026-10-07');
    await expect(row(frame, milestone).locator(':scope > div').nth(5)).toHaveText('0d');
    // Exercise both real user entry surfaces: positive -> zero in the table,
    // then positive -> zero in the Gantt popover. Inspect the actual diamond.
    await editDuration(frame, milestone, '2');
    await editDuration(frame, milestone, '0');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-duration', '0');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-start', '2026-10-07');
    await expect(row(frame, milestone)).toHaveAttribute('data-row-due', '2026-10-07');
    await expect(row(frame, milestone).locator(':scope > div').nth(5)).toHaveText('0d');
    await page.screenshot({ path: info.outputPath('declared-zero-discard-reopen.png'), fullPage: true, animations: 'disabled' });
    await frame.getByRole('button', {name:/^Gantt/i}).first().click();
    const bar=frame.locator(`[data-testid="gantt-bar"][data-key="${milestone}"]`);
    await expect(bar).toHaveAttribute('data-milestone','1');
    await expect(bar.locator('div[style*="rotate(45deg)"]')).toBeVisible();
    await bar.click();
    const editor=frame.locator(`[data-testid="date-editor"][data-issue-key="${milestone}"]`);
    await expect(editor.locator('input[inputmode="numeric"]')).toHaveValue('0');
    await editor.locator('input[inputmode="numeric"]').fill('2');
    await editor.locator('[data-testid="dateeditor-apply"]').click();
    await expect(bar).not.toHaveAttribute('data-milestone','1');
    await bar.click();await editor.locator('input[inputmode="numeric"]').fill('0');
    await editor.locator('[data-testid="dateeditor-apply"]').click();
    await expect(bar).toHaveAttribute('data-milestone','1');
    await expect(bar.locator('div[style*="rotate(45deg)"]')).toBeVisible();
    await page.screenshot({path:info.outputPath('zero-gantt-diamond.png'),fullPage:true,animations:'disabled'});
    await frame.getByRole('button',{name:/^Table/i}).first().click();
    await expect(row(frame,milestone)).toHaveAttribute('data-row-duration','0');
    await expect(row(frame,milestone)).toHaveAttribute('data-row-due','2026-10-07');

  }, true);
});

test('normalization: intentional duration clear on date-backed import survives Save and reopen', async ({ page }, info) => {
  await withOwnedSchedule(page, info, [seed('date-backed clear', null)], async (f) => {
    const key = f.keys[0]; let frame = await table(page, f.name);
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '5');
    await editDuration(frame, key, '');
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '');
    await expect(row(frame, key)).toHaveAttribute('data-row-start', '2026-10-05');
    await expect(row(frame, key)).toHaveAttribute('data-row-due', '2026-10-09');
    await save(frame);
    const saved = (await getTestState('lz-ppm', { what: 'plan', planId: f.planId })).issues.find((i: any) => i.key === key);
    expect(saved).toMatchObject({ duration: null, durationExplicitlyCleared: true, startDate: '2026-10-05', dueDate: '2026-10-09' });
    await info.attach('persisted-clear', { body: JSON.stringify(saved), contentType: 'application/json' });
    frame = await table(page, f.name);
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '');
    await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes', '0');
    expect(await f.read(key)).toEqual({ key, start: '2026-10-05', due: '2026-10-09', duration: null });
    await page.screenshot({ path: info.outputPath('duration-cleared-reopened.png'), fullPage: true, animations: 'disabled' });
    await discard(frame);
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '5');
    frame = await table(page, f.name);
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '5');
  });
});

test('normalization: hydration uses custom working days and leaves inverted range unavailable', async ({ page }, info) => {
  await withOwnedSchedule(page, info, [seed('calendar range', null), seed('inverted range', null, '2026-10-09', '2026-10-05')], async (f) => {
    const [valid, invalid] = f.keys; let frame = await table(page, f.name);
    await expect(row(frame, valid)).toHaveAttribute('data-row-duration', '5');
    await expect(row(frame, invalid)).toHaveAttribute('data-row-duration', '');
    await frame.getByRole('button', { name: /^Schedule/i }).first().click();
    await frame.getByRole('button', { name: /Create Custom Calendar/ }).click();
    await frame.getByPlaceholder('e.g., Saudi Arabia (Sun-Thu)').fill('Harness Mon Wed Fri');
    await frame.getByRole('button', { name: 'Tue', exact: true }).click();
    await frame.getByRole('button', { name: 'Thu', exact: true }).click();
    await frame.getByRole('button', { name: 'Apply Custom Calendar', exact: true }).click();
    await expect(frame.getByText('Harness Mon Wed Fri', { exact: true })).toBeVisible();
    // Full reopen is real calendar+issue hydration; no injected state or fake clock.
    frame = await table(page, f.name);
    await refresh(page, frame, f.planId);
    await expect(row(frame, valid)).toHaveAttribute('data-row-duration', '3');
    await expect(row(frame, valid)).toHaveAttribute('data-row-start', '2026-10-05');
    await expect(row(frame, valid)).toHaveAttribute('data-row-due', '2026-10-09');
    await expect(row(frame, invalid)).toHaveAttribute('data-row-duration', '');
    await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes', '0');
    expect(await f.read(valid)).toEqual({ key: valid, start: '2026-10-05', due: '2026-10-09', duration: null });
    await page.screenshot({ path: info.outputPath('custom-calendar-hydration.png'), fullPage: true, animations: 'disabled' });
    await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
    const card = frame.locator('[data-testid="schedule-confidence"]');
    await expect(card).toContainText('Forecast unavailable'); await expect(card).toContainText(invalid);
    await expect(card).toHaveAttribute('data-p90', '');
  });
});

test('apply: owned edit Cancel writes nothing, confirmation writes exact dates and retains normalized reopen', async ({ page }, info) => {
  await withOwnedSchedule(page, info, [seed('apply owned', 3, '2026-10-05', '2026-10-07')], async (f) => {
    const key = f.keys[0]; let frame = await table(page, f.name);
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '3');
    const original = await f.read(key);
    await editDuration(frame, key, '4');
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '4');
    await expect(row(frame, key)).toHaveAttribute('data-row-due', '2026-10-08');
    let modal = await review(frame);
    await expect(modal.locator('[data-testid="apply-change-row"]')).toHaveCount(1);
    await expect(modal.locator('[data-testid="apply-change-row"]')).toHaveAttribute('data-issue-key', key);
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(modal).toHaveCount(0);
    expect(await f.read(key), 'cancel did not write any Jira field').toEqual(original);
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '4');
    modal = await review(frame);
    await modal.getByRole('button', { name: /^Apply 1 Change/i }).click();
    await expect(frame.getByText('Successfully wrote 1 issue', { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect.poll(() => f.read(key), { timeout: 60_000 }).toEqual({ key, start: '2026-10-05', due: '2026-10-08', duration: 4 });
    const second = await f.read(key);
    expect(second).toEqual({ key, start: '2026-10-05', due: '2026-10-08', duration: 4 });
    await info.attach('apply-second-rest-read', { body: JSON.stringify({ original, after: second }), contentType: 'application/json' });
    frame = await table(page, f.name);
    await expect(row(frame, key)).toHaveAttribute('data-row-duration', '4');
    await expect(row(frame, key)).toHaveAttribute('data-row-due', '2026-10-08');
    await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes', '0');
    await expect(frame.getByRole('button', { name: /^Apply \d+ change/i })).toHaveCount(0);
    console.log('APPLY_REOPEN', JSON.stringify(await snapshot(frame, key)));
    await expect(row(frame,key)).toBeVisible();
    await row(frame,key).screenshot({ path: info.outputPath('apply-complete-reopen-row.png'), animations: 'disabled' });
    await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
    await expect(row(frame,key)).toBeVisible();
    await page.screenshot({ path: info.outputPath('apply-complete-reopen.png'), fullPage: true, animations: 'disabled' });
  });
});
