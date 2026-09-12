import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { readFileSync, writeFileSync } from 'node:fs';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from './chatwise-support';

test.describe.configure({ retries: 0 });
test('inspect the retained issue planning response without dispatching work', async ({ page }) => {
  test.skip(process.env.CW_DURABLE_INSPECT !== '1', 'Explicit read-only inspection');
  const folder = '/tmp/cw-durable-issues-20260912-v6170';
  const previous = JSON.parse(readFileSync(`${folder}/result.json`, 'utf8'));
  expect(previous.turns).toHaveLength(2);
  expect(previous.turns[1].jobId).toBe('job_1789229526917_m8vah055a');
  expect(previous.turns[1].snapshot.result.usage.total_tokens).toBe(66007);
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  await expect(frame.locator('body')).toContainText(process.env.CW_EXPECT_VERSION!);
  const response: any = await callResolver(frame, GLOBAL_APP, 'getIssueTaskPlan', {
    jobId: previous.turns[1].jobId, batchIndex: 0,
  });
  expect(response.success).toBe(true);
  writeFileSync(`${folder}/batch0-inspection.json`, JSON.stringify({ observedAt: new Date().toISOString(), response }, null, 2), { flag: 'wx' });
  console.log('SAVED_PLAN_DIAGNOSTICS', JSON.stringify(response.data.diagnostics));
  expect(response.data.expectedCount).toBe(5);
  const after: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: previous.turns[1].jobId });
  expect(after.data.result.finishedAt).toBe(previous.turns[1].snapshot.result.finishedAt);
  expect(after.data.result.usage.total_tokens).toBe(66007);
});
