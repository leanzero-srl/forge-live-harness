import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from './chatwise-support';

test.describe.configure({ retries: 0 });
test('inspect the retained issue planning response without dispatching work', async ({ page }) => {
  test.skip(process.env.CW_DURABLE_INSPECT !== '1', 'Explicit read-only inspection');
  const folder = '/tmp/cw-durable-issues-20260912-v6170';
  const raw = process.env.CW_DURABLE_INSPECT_RAW === '1';
  const batchIndex = Number(process.env.CW_DURABLE_INSPECT_BATCH || '0');
  expect(Number.isInteger(batchIndex) && batchIndex >= 0 && batchIndex < 20).toBe(true);
  const originalInspectionPath = `${folder}/batch${batchIndex}-inspection.json`;
  const originalInspection = raw ? readFileSync(originalInspectionPath, 'utf8') : null;
  const previous = JSON.parse(readFileSync(`${folder}/result.json`, 'utf8'));
  expect(previous.turns).toHaveLength(2);
  expect(previous.turns[1].jobId).toBe('job_1789229526917_m8vah055a');
  expect(previous.turns[1].snapshot.result.usage.total_tokens).toBe(66007);
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  await expect(frame.locator('body')).toContainText(process.env.CW_EXPECT_VERSION!);
  const before: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: previous.turns[1].jobId });
  expect(before.success).toBe(true);
  const response: any = await callResolver(frame, GLOBAL_APP, 'getIssueTaskPlan', {
    jobId: previous.turns[1].jobId, batchIndex,
  });
  expect(response.success).toBe(true);
  writeFileSync(`${folder}/batch${batchIndex}${raw ? '-raw' : ''}-inspection.json`, JSON.stringify({ observedAt: new Date().toISOString(), response }, null, 2), { flag: 'wx' });
  console.log('SAVED_PLAN_DIAGNOSTICS', JSON.stringify(response.data.diagnostics));
  expect(response.data.expectedCount).toBe(5);
  if (raw) {
    expect(typeof response.data.rawText).toBe('string');
    expect(response.data.rawText.length).toBeGreaterThan(0);
    expect(response.data.rawText.length).toBe(response.data.visibleChars);
    expect(createHash('sha256').update(response.data.rawText).digest('hex')).toBe(response.data.contentHash);
    const retained = JSON.parse(originalInspection!).response.data;
    expect(response.data.body).toEqual(retained.body);
    expect(response.data.receipt).toEqual(retained.receipt);
    expect(response.data.cumulativeUsage).toEqual(retained.cumulativeUsage);
    expect(readFileSync(originalInspectionPath, 'utf8')).toBe(originalInspection);
  }
  const after: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: previous.turns[1].jobId });
  expect(after.data.result.finishedAt).toBe(before.data.result.finishedAt);
  expect(after.data.result.usage).toEqual(before.data.result.usage);
  expect(after.data.status).toBe(before.data.status);
  expect(after.data.result.response).toBe(before.data.result.response);
});
