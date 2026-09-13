import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { request } from '../../data/jira.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, awaitSwapSettled, callResolver } from './chatwise-support';
import { verifyDurableIssueReadback } from './durable-issue-readback';

const JOB = 'job_1789229526917_m8vah055a';
const CONVERSATION = 'conv_1789229496955_nlcs7qbzy';
const ORIGIN_GENERATION = '2026-09-12T16:14:55.214Z';
const FIELD_REPAIR = process.env.CW_DURABLE_RECOVER_FIELDS === '1';
const OUTPUT_REPAIR = process.env.CW_DURABLE_RECOVER_OUTPUT === '1';
const QUALITY_REPAIR = process.env.CW_DURABLE_RECOVER_QUALITY === '1';
const GENERATION = QUALITY_REPAIR ? '2026-09-12T18:51:26.263Z' : OUTPUT_REPAIR ? '2026-09-12T18:14:08.601Z' : FIELD_REPAIR ? '2026-09-12T16:56:05.322Z' : ORIGIN_GENERATION;
const PRIOR_USAGE = (OUTPUT_REPAIR || QUALITY_REPAIR) ? 199469 : FIELD_REPAIR ? 113919 : 66007;
test.describe.configure({ retries: 0 });
test('resume owned saved100issue plan once and verify all100 issues', async ({ page }) => {
  test.skip(process.env.CW_DURABLE_RECOVER !== '1', 'Explicit saved-plan acceptance only');
  test.setTimeout(5_400_000);
  expect([FIELD_REPAIR, OUTPUT_REPAIR, QUALITY_REPAIR].filter(Boolean).length, 'Recovery modes bind different saved generations').toBeLessThanOrEqual(1);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  expect(process.env.CW_EXPECT_VERSION).toMatch(/^v6\.\d+\.0$/);
  const original = JSON.parse(readFileSync('/tmp/cw-durable-issues-20260912-v6170/result.json', 'utf8'));
  expect(original.conversationId).toBe(CONVERSATION);
  expect(original.projectKey).toBe('DL9491863');
  expect(original.turns).toHaveLength(2);
  expect(original.turns[1].jobId).toBe(JOB);
  expect(original.turns[1].snapshot.result.finishedAt).toBe(ORIGIN_GENERATION);
  expect(original.turns[1].snapshot.result.usage.total_tokens).toBe(66007);
  const retainedJournals = new Map<string, string>();
  if (FIELD_REPAIR || OUTPUT_REPAIR || QUALITY_REPAIR) {
    const path = '/tmp/cw-durable-issues-20260912-saved-plan-recovery/result.json';
    const text = readFileSync(path, 'utf8'); retainedJournals.set(path, text);
    const retained = JSON.parse(text);
    expect(retained.jobId).toBe(JOB);
    expect(retained.snapshot.status).toBe('completed');
    expect(retained.snapshot.result.finishedAt).toBe('2026-09-12T16:56:05.322Z');
    expect(retained.snapshot.result.usage.total_tokens).toBe(113919);
    expect(retained.snapshot.result.response).toContain('unsupported planning fields');
  }
  if (OUTPUT_REPAIR || QUALITY_REPAIR) {
    const path = '/tmp/cw-durable-issues-20260912-saved-plan-recovery-fields/result.json';
    const text = readFileSync(path, 'utf8'); retainedJournals.set(path, text);
    const retained = JSON.parse(text);
    expect(retained.jobId).toBe(JOB); expect(retained.conversationId).toBe(CONVERSATION);
    expect(retained.projectKey).toBe(original.projectKey);
    expect(retained.snapshot.status).toBe('completed');
    expect(retained.snapshot.cancellationRequested).toBe(false);
    expect(retained.snapshot.result.finishedAt).toBe('2026-09-12T18:14:08.601Z');
    expect(retained.snapshot.result.usage.total_tokens).toBe(PRIOR_USAGE);
    expect(retained.snapshot.result.response).toContain('Prepared 60 of 100 issues. Created 0 of 100 issues.');
    expect(retained.snapshot.result.response).toContain('The saved planning response was incomplete or refused. No issues were created from it.');
    expect(retained.snapshot.result.executedWrites || []).toHaveLength(0);
    expect(retained.snapshot.result.issueTaskResume).toEqual({ jobId: JOB, generation: '2026-09-12T18:14:08.601Z', completedCount: 0, total: 100, preparedCount: 60 });
  }
  if (QUALITY_REPAIR) {
    const path = '/tmp/cw-durable-issues-20260912-saved-plan-recovery-output/result.json';
    const text = readFileSync(path, 'utf8'); retainedJournals.set(path, text);
    const retained = JSON.parse(text);
    expect(retained.jobId).toBe(JOB); expect(retained.conversationId).toBe(CONVERSATION);
    expect(retained.projectKey).toBe(original.projectKey);
    expect(retained.snapshot.status).toBe('completed');
    expect(retained.snapshot.cancellationRequested).toBe(false);
    expect(retained.snapshot.result.finishedAt).toBe(GENERATION);
    expect(retained.snapshot.result.usage.total_tokens).toBe(PRIOR_USAGE);
    expect(retained.snapshot.result.response).toContain('complete remaining issue plan exceeds the bounded750000-token workflow allowance');
    expect(retained.snapshot.result.executedWrites || []).toHaveLength(0);
    expect(retained.snapshot.result.issueTaskResume).toEqual({ jobId: JOB, generation: GENERATION, completedCount: 0, total: 100, preparedCount: 60 });
  }
  const folder = '/tmp/cw-durable-issues-20260912-saved-plan-recovery' + (QUALITY_REPAIR ? '-quality-v4' : OUTPUT_REPAIR ? '-output' : FIELD_REPAIR ? '-fields' : '');
  mkdirSync(folder, { recursive: true });
  const journal = folder + '/result.json';
  const observing = process.env.CW_DURABLE_OBSERVE === '1';
  const previous = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : null;
  if (observing) { expect(previous?.jobId).toBe(JOB); expect(previous?.dispatchIntent).toBeTruthy(); expect(previous?.originalGeneration).toBe(GENERATION); expect(previous?.conversationId).toBe(CONVERSATION); expect(previous?.projectKey).toBe(original.projectKey); }
  else expect(previous, 'Existing recovery must be observed, never resent').toBeNull();
  const entry: any = previous || { jobId: JOB, conversationId: CONVERSATION, projectKey: original.projectKey,
    originalGeneration: GENERATION, originalUsage: PRIOR_USAGE, originalTurns: original.turns,
    ...((OUTPUT_REPAIR || QUALITY_REPAIR) ? { recoveryMode: QUALITY_REPAIR ? 'quality-v4' : 'saved-output', retainedReceipts: [...retainedJournals].map(([path, text]) => ({ path, receipt: JSON.parse(text) })) } : {}),
    expectedVersion: process.env.CW_EXPECT_VERSION, createdAt: new Date().toISOString() };
  const save = () => { const temp = journal + '.' + process.pid + '.tmp'; writeFileSync(temp, JSON.stringify(entry, null, 2)); renameSync(temp, journal); };
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  await expect(frame.locator('body')).toContainText(process.env.CW_EXPECT_VERSION!);
  const owned: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: JOB });
  expect(owned.success).toBe(true);
  expect(owned.data.result.conversationId).toBe(CONVERSATION);
  const project: any = await request('GET', '/rest/api/3/project/' + entry.projectKey);
  const myself: any = await request('GET', '/rest/api/3/myself');
  expect(project.id).toBe(original.project.id);
  expect(project.lead.accountId).toBe(myself.accountId);
  if (!observing) {
    expect(owned.data.status).toBe('completed');
    expect(owned.data.cancellationRequested).toBe(false);
    expect(owned.data.result.finishedAt).toBe(GENERATION);
    expect(owned.data.result.usage.total_tokens).toBe(PRIOR_USAGE);
    expect(owned.data.result.issueTaskResume).toEqual({ jobId: JOB, generation: GENERATION, completedCount: 0, total: 100, ...((OUTPUT_REPAIR || QUALITY_REPAIR) ? { preparedCount: 60 } : {}) });
    if (OUTPUT_REPAIR || QUALITY_REPAIR) {
      expect(owned.data.result.response).toContain('Prepared 60 of 100 issues. Created 0 of 100 issues.');
      expect(owned.data.result.response).toContain(QUALITY_REPAIR ? 'complete remaining issue plan exceeds the bounded750000-token workflow allowance' : 'The saved planning response was incomplete or refused. No issues were created from it.');
      expect(owned.data.result.executedWrites || []).toHaveLength(0);
    }
    expect(existsSync(folder + '/STOP.txt')).toBe(false);
    entry.before = owned.data;
    entry.dispatchIntent = { jobId: JOB, generation: GENERATION, at: new Date().toISOString() };
    writeFileSync(journal, JSON.stringify(entry, null, 2), { flag: 'wx' });
    const resumed: any = await callResolver(frame, GLOBAL_APP, 'resumeIssueTaskJob', { jobId: JOB, generation: GENERATION });
    entry.dispatchResponse = resumed; save();
    expect(resumed.success).toBe(true);
    expect(resumed.jobId).toBe(JOB);
    expect(resumed.resumeFrom).toBe(GENERATION);
  }
  const until = Date.now() + 4_800_000;
  let terminal: any = null;
  while (Date.now() < until) {
    const current: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: JOB });
    expect(current.success).toBe(true);
    expect(current.data.result.conversationId).toBe(CONVERSATION);
    entry.snapshot = current.data;
    for (const event of current.data.result.progressEvents || []) {
      if (!(entry.progress ||= []).some((item: any) => item.label === event.label)) {
        entry.progress.push({ label: event.label, observedAt: new Date().toISOString() });
        console.log('DURABLE_RECOVERY_PROGRESS', event.label);
      }
    }
    save();
    const stale = current.data.result.finishedAt === GENERATION && ['completed', 'failed'].includes(current.data.status);
    if (['completed', 'failed', 'cancelled'].includes(current.data.status) && !stale) { terminal = current.data; break; }
    if (existsSync(folder + '/STOP.txt') || (QUALITY_REPAIR && current.data.result.usage?.total_tokens > PRIOR_USAGE + 750000 - 143816)) {
      entry.cancel = await callResolver(frame, GLOBAL_APP, 'cancelJob', { jobId: JOB }); save();
      throw new Error('Stopped original job; never repeat dispatch');
    }
    await page.waitForTimeout(4000);
  }
  expect(terminal, 'Observe original job after timeout; never resend').toBeTruthy();
  expect(terminal.status).toBe('completed');
  expect(terminal.result.truncated, terminal.result.response).toBe(false);
  expect(terminal.result.response).toContain('Created all 100');
  expect(terminal.result.usage.total_tokens).toBeGreaterThanOrEqual(PRIOR_USAGE);
  if (QUALITY_REPAIR) expect(terminal.result.usage.total_tokens).toBeLessThanOrEqual(PRIOR_USAGE + 750000 - 143816);
  await verifyDurableIssueReadback(entry, terminal.result, save);
  await page.reload();
  await waitForChatApp(page, frame, GLOBAL_APP);
  await frame.locator('.conversation-item[data-conversation-id="' + CONVERSATION + '"]').click();
  await awaitSwapSettled(frame);
  const receipt = frame.locator('.message.assistant').filter({ hasText: 'Created all 100' });
  await expect(receipt).toHaveCount(1);
  for (const issue of entry.issues) await expect(receipt).toContainText(issue.key);
  await page.screenshot({ path: folder + '/completed.png', fullPage: true });
  entry.acceptance = { count: 100, sameJobId: JOB, originalProjectRetained: true, noNewUserPrompt: true,
    allFieldsReadBack: true, reloadedSingleReceipt: true, semanticReviewPending: true };
  save();
  for (const [path, text] of retainedJournals) expect(readFileSync(path, 'utf8')).toBe(text);
});
