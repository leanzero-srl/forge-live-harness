// PROBE-0, part two: the DEGRADED PATH's named way through.
// The first dispatch (journey-confluence-read.spec.ts) reached Confluence, read the
// page, and then ran out of the site's per-minute model allowance; the user-visible
// reply became "Wait a minute, then ask me to continue the remaining work." This spec
// does exactly what that sentence instructs, in the SAME conversation, once — and
// checks the answer the first turn owed the user. Its own exclusive journal.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  GLOBAL_APP, openGlobalPage, waitForChatApp, settleBootSelection, awaitSwapSettled,
  readAppState, deliverMessage, callResolver,
} from './chatwise-support';

const FOLDER = '/tmp/cw-confluence-probe0';
const PROMPT = 'Continue the remaining work: tell me the home page title and its first sentence.';

test.describe.configure({ retries: 0 });
test('the quota-degraded turn can be continued and delivers the Confluence answer', async ({ page }) => {
  test.skip(process.env.CW_CONFLUENCE_CONTINUE !== '1', 'Explicit paid acceptance opt-in required');
  test.setTimeout(900_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');

  const first = JSON.parse(readFileSync(`${FOLDER}/result.json`, 'utf8'));
  expect(first.conversationId, 'the first dispatch must have recorded its conversation').toBeTruthy();
  const observe = process.env.CW_CONFLUENCE_OBSERVE === '1';
  mkdirSync(FOLDER, { recursive: true });
  const journal = `${FOLDER}/continue.json`;
  const prior = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : null;
  const entry: any = prior || {
    prompt: PROMPT, conversationId: first.conversationId, oracle: first.oracle,
    createdAt: new Date().toISOString(), dispatchCount: 0, events: [], snapshots: [],
  };
  if (observe) {
    expect(prior).toBeTruthy();
    expect(entry.jobId).toMatch(/^job_/);
  } else {
    expect(prior, 'A continuation already ran. Use CW_CONFLUENCE_OBSERVE=1; never repeat a paid dispatch').toBeNull();
    writeFileSync(journal, JSON.stringify(entry, null, 2), { flag: 'wx' });
  }
  const save = () => {
    const tmp = `${journal}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(entry, null, 2));
    renameSync(tmp, journal);
  };

  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);

  if (!observe) {
    await settleBootSelection(page, frame);
    const row = frame.locator(`#conversationsList .conversation-item[data-conversation-id="${first.conversationId}"]`);
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await row.click();
    await awaitSwapSettled(frame);
    expect(await readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()')).toBe(first.conversationId);
    entry.state = 'submitting';
    entry.dispatchCount = 1;
    entry.submittedAt = new Date().toISOString();
    save();
    await deliverMessage(page, frame, PROMPT, 'confluence probe-0 continue');
    await expect.poll(async () => {
      const jobId = await readAppState<string | null>(frame, GLOBAL_APP, 'app.currentJobId');
      if (!jobId) return false;
      entry.jobId = jobId; save(); return true;
    }, { timeout: 90_000 }).toBe(true);
  }

  const deadline = Date.parse(entry.submittedAt) + 780_000;
  while (true) {
    const response: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: entry.jobId });
    expect(response.success).toBe(true);
    const current = response.data;
    entry.snapshot = current;
    for (const event of current.result?.progressEvents || []) {
      if (!entry.events.some((old: any) => old.id === event.id)) entry.events.push(event);
    }
    save();
    const fp = JSON.stringify([current.status, current.result?.progressNote, current.result?.usage]);
    if (entry.lastFingerprint !== fp) {
      entry.lastFingerprint = fp;
      console.log('CONFLUENCE_CONTINUE', current.status, current.result?.progressNote || '', current.result?.usage?.total_tokens || 0);
    }
    if (['completed', 'failed', 'cancelled'].includes(current.status)) break;
    if (Date.now() >= deadline || (current.result?.usage?.total_tokens || 0) > 200_000) {
      entry.cancel = await callResolver(frame, GLOBAL_APP, 'cancelJob', { jobId: entry.jobId });
      save();
      throw new Error('Bounded guard stopped the continuation. No resend.');
    }
    await page.waitForTimeout(2500);
  }

  entry.reply = String(entry.snapshot.result?.response || '');
  entry.toolLabels = entry.events.map((e: any) => e.label);
  writeFileSync(`${FOLDER}/continue-reply.txt`, entry.reply);
  save();
  await page.screenshot({ path: `${FOLDER}/continued.png`, fullPage: true }).catch(() => {});

  expect(entry.snapshot.status, entry.reply.slice(0, 400)).toBe('completed');
  expect(entry.reply, 'the continuation did not deliver the home page title').toContain(entry.oracle.homepageTitle);
  expect(entry.reply, 'the continuation is another quota apology, not an answer').not.toMatch(/rate-limit|shared model allowance/i);
});
