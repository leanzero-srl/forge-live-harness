// One paid UI dispatch, read-only business request. Observe mode cannot send or resume.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { BASE as JIRA_BASE, request } from '../../data/jira.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, settleBootSelection, awaitSwapSettled, readAppState, sendMessage, callResolver, pickPersonaIfGated } from './chatwise-support';

const FOLDER = '/tmp/cw-progressive-tools-173';
const PROJECT = 'DL9491863';
const VERSION = 'v6.173.0';
const PROMPT = `Read the permission scheme currently assigned to Jira project ${PROJECT} and tell me its exact name and ID. Read it from Jira now and keep the answer brief. Do not create, update, attach or delete anything.`;

test.describe.configure({ retries: 0 });
test('natural administrator read loads a schema and reports the assigned permission scheme', async ({ page }) => {
  test.skip(process.env.CW_PROGRESSIVE_LIVE !== '1', 'Explicit paid acceptance opt-in required');
  test.setTimeout(780_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  expect(new URL(JIRA_BASE).hostname).toBe('wolfaenpak.atlassian.net');
  const observe = process.env.CW_PROGRESSIVE_OBSERVE === '1';
  mkdirSync(FOLDER, { recursive: true });
  const journal = `${FOLDER}/result.json`;
  const prior = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : null;
  const entry: any = prior || { projectKey: PROJECT, expectedVersion: VERSION, prompt: PROMPT, createdAt: new Date().toISOString(), dispatchCount: 0, events: [], snapshots: [] };
  if (observe) {
    expect(prior, 'Observation requires the existing exclusive journal').toBeTruthy();
    expect(entry.jobId, 'Submission is uncertain: inspect it; never resend').toMatch(/^job_/);
    expect(entry.projectKey).toBe(PROJECT);
    expect(entry.prompt).toBe(PROMPT);
    expect(entry.dispatchCount).toBe(1);
  } else {
    expect(prior, 'An earlier run exists. Use observation; never repeat a paid dispatch').toBeNull();
    writeFileSync(journal, JSON.stringify(entry, null, 2), { flag: 'wx' });
  }
  const save = () => {
    const temporary = `${journal}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(entry, null, 2)); renameSync(temporary, journal);
  };
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  await expect(frame.locator('body')).toContainText(VERSION);
  entry.observedVersion = VERSION; save();
  const readScheme = async () => {
    const value: any = await request('GET', `/rest/api/3/project/${PROJECT}/permissionscheme`);
    expect(String(value.id)).toMatch(/^\d+$/);
    expect(typeof value.name).toBe('string'); expect(value.name.length).toBeGreaterThan(0);
    return { id: String(value.id), name: value.name };
  };
  if (!observe) {
    entry.oracleBefore = await readScheme(); save();
    expect(existsSync(`${FOLDER}/STOP.txt`)).toBe(false);
    await settleBootSelection(page, frame);
    await frame.locator('#newChatButton').click(); await pickPersonaIfGated(frame); await awaitSwapSettled(frame);
    await frame.locator('#dropdownSelected').click();
    await frame.locator('#dropdownOptions .dropdown-option[data-persona-id="jira-admin"]').click();
    await expect(frame.locator('#dropdownSelected .selected-text')).toHaveText('Jira Administrator');
    entry.conversationId = await readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()');
    expect(entry.conversationId).toBeTruthy();
    expect(existsSync(`${FOLDER}/STOP.txt`)).toBe(false);
    entry.state = 'submitting'; entry.dispatchCount = 1; entry.submittedAt = new Date().toISOString(); save();
    await sendMessage(page, frame, PROMPT); // The only dispatch in this file; no confirmation or retry path.
    await expect.poll(async () => {
      const jobId = await readAppState<string | null>(frame, GLOBAL_APP, 'app.currentJobId');
      if (!jobId) return false;
      entry.jobId = jobId; entry.state = 'queued'; save(); return true;
    }, { timeout: 60_000 }).toBe(true);
  }
  const deadline = Date.parse(entry.submittedAt) + 600_000;
  expect(Number.isFinite(deadline)).toBe(true);
  while (true) {
    const response: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: entry.jobId });
    expect(response.success).toBe(true);
    const current = response.data;
    expect(current.result?.conversationId).toBe(entry.conversationId);
    entry.snapshot = current;
    for (const event of current.result?.progressEvents || []) {
      if (!entry.events.some((old: any) => old.id === event.id)) entry.events.push({ ...event, observedAt: new Date().toISOString() });
    }
    const fingerprint = JSON.stringify([current.status, current.result?.progressNote, current.result?.usage]);
    if (entry.lastFingerprint !== fingerprint) {
      entry.lastFingerprint = fingerprint;
      entry.snapshots.push({ at: new Date().toISOString(), status: current.status, progress: current.result?.progressNote, usage: current.result?.usage });
      console.log('PROGRESSIVE_READ', current.status, current.result?.progressNote || '', current.result?.usage?.total_tokens || 0);
    }
    save();
    if (['completed', 'failed', 'cancelled'].includes(current.status)) break;
    const stop = existsSync(`${FOLDER}/STOP.txt`) || Date.now() >= deadline || (current.result?.usage?.total_tokens || 0) > 100_000 || current.status === 'retrying';
    if (stop) {
      entry.guardStoppedAt = new Date().toISOString();
      entry.cancel = await callResolver(frame, GLOBAL_APP, 'cancelJob', { jobId: entry.jobId }); save();
      throw new Error('Bounded guard stopped this job. Inspect the saved receipt; no automatic resend or resume.');
    }
    await page.waitForTimeout(2500);
  }
  entry.oracleAfter = await readScheme(); save();
  expect(entry.oracleAfter).toEqual(entry.oracleBefore);
  expect(entry.snapshot.status).toBe('completed');
  const result = entry.snapshot.result;
  expect(result.truncated, result.response).not.toBe(true);
  expect(result.executedWrites || []).toHaveLength(0);
  expect(result.decks || []).toHaveLength(0);
  expect(result.usage?.total_tokens).toBeGreaterThan(0);
  expect(result.response).toContain(entry.oracleBefore.name);
  const ids = String(result.response).match(/\d+/g) || [];
  expect(ids, 'The exact ID must occur as a complete number').toContain(entry.oracleBefore.id);
  const load = entry.events.findIndex((event: any) => /^Running load tools$/i.test(event.label));
  const read = entry.events.findIndex((event: any, index: number) => index > load && /^Running (get permission scheme|read jira api|get project configuration)$/i.test(event.label));
  expect(load, 'No actual schema loading activity was observed').toBeGreaterThanOrEqual(0);
  expect(read, 'No supported scheme read followed schema loading').toBeGreaterThan(load);
  entry.acceptance = { onePaidPrompt: true, oracleMatches: true, loadBeforeRead: true, noWriteReceipts: true, manualAnswerReviewPending: true, exactToolArgumentsRequireWorkerLogReview: true };
  save();
  if (!observe) {
    await expect(frame.locator('.message.assistant').last()).toContainText(entry.oracleBefore.name, { timeout: 60_000 });
    await page.screenshot({ path: `${FOLDER}/completed.png`, fullPage: true });
  }
});
