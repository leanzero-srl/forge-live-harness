// PROBE-0, part three: close the USER-VISIBLE clause.
// Parts one and two proved the tools reach Confluence (logs: readConfluencePage(852172)
// 6591 of 6591 chars) but the ANSWER never reached the user — both turns spent their
// tier's token-per-minute allowance on the 25-item listings and ended in the quota
// apology. This turn asks for the one read only, so the turn fits inside the allowance
// and the reply itself can be checked. Same default persona, fresh chat, one dispatch.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { get } from '../../data/jira.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  GLOBAL_APP, openGlobalPage, waitForChatApp, settleBootSelection, awaitSwapSettled,
  readAppState, readThread, deliverMessage, callResolver, pickPersonaIfGated } from './chatwise-support';

const FOLDER = '/tmp/cw-confluence-probe0';
const HOME_ID = '852172';
const PROMPT = `Read the Confluence page with id ${HOME_ID} and tell me its exact title and its first sentence. Nothing else.`;

test.describe.configure({ retries: 0 });
test('a narrow Confluence read reaches the user as the exact page title', async ({ page }) => {
  test.skip(process.env.CW_CONFLUENCE_NARROW !== '1', 'Explicit paid acceptance opt-in required');
  test.setTimeout(900_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const observe = process.env.CW_CONFLUENCE_OBSERVE === '1';
  mkdirSync(FOLDER, { recursive: true });
  const journal = `${FOLDER}/narrow.json`;
  const prior = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : null;
  const entry: any = prior || { prompt: PROMPT, createdAt: new Date().toISOString(), dispatchCount: 0, events: [], snapshots: [] };
  if (observe) {
    expect(prior).toBeTruthy();
    expect(entry.jobId).toMatch(/^job_/);
  } else {
    expect(prior, 'A narrow read already ran. Use CW_CONFLUENCE_OBSERVE=1; never repeat a paid dispatch').toBeNull();
    writeFileSync(journal, JSON.stringify(entry, null, 2), { flag: 'wx' });
  }
  const save = () => {
    const tmp = `${journal}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(entry, null, 2));
    renameSync(tmp, journal);
  };

  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);

  if (observe) {
    await settleBootSelection(page, frame);
    const row = frame.locator(`#conversationsList .conversation-item[data-conversation-id="${entry.conversationId}"]`);
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await row.click();
    await awaitSwapSettled(frame);
  } else {
    const home: any = await get(`/wiki/api/v2/pages/${HOME_ID}?body-format=storage`);
    entry.oracle = { id: String(home.id), title: home.title };
    save();
    expect(entry.oracle.title).toBe('WORK FOR HIRE Home');
    await settleBootSelection(page, frame);
    await frame.locator('#newChatButton').click(); await pickPersonaIfGated(frame);
    await awaitSwapSettled(frame);
    entry.persona = await frame.locator('#dropdownSelected .selected-text').innerText();
    entry.conversationId = await readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()');
    entry.dispatchCount = 1;
    entry.submittedAt = new Date().toISOString();
    save();
    await deliverMessage(page, frame, PROMPT, 'confluence probe-0 narrow');
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
      console.log('CONFLUENCE_NARROW', current.status, current.result?.progressNote || '', current.result?.usage?.total_tokens || 0);
    }
    if (['completed', 'failed', 'cancelled'].includes(current.status)) break;
    if (Date.now() >= deadline || (current.result?.usage?.total_tokens || 0) > 200_000) {
      entry.cancel = await callResolver(frame, GLOBAL_APP, 'cancelJob', { jobId: entry.jobId });
      save();
      throw new Error('Bounded guard stopped the narrow read. No resend.');
    }
    await page.waitForTimeout(2500);
  }

  entry.reply = String(entry.snapshot.result?.response || '');
  entry.toolLabels = entry.events.map((e: any) => e.label);
  entry.model = entry.snapshot.result?.model;
  entry.usage = entry.snapshot.result?.usage;
  writeFileSync(`${FOLDER}/narrow-reply.txt`, entry.reply);
  save();
  await page.screenshot({ path: `${FOLDER}/narrow.png`, fullPage: true }).catch(() => {});

  expect(entry.snapshot.status, entry.reply.slice(0, 300)).toBe('completed');
  expect(entry.toolLabels.some((l: string) => /read confluence page/i.test(String(l))),
    `no page read ran. labels: ${JSON.stringify(entry.toolLabels)}`).toBe(true);
  expect(entry.reply, 'the exact title never reached the user').toContain(entry.oracle.title);
  expect(entry.reply, 'a quota apology, not an answer').not.toMatch(/rate-limit|shared model allowance/i);
  // The rendered bubble, not just the resolver payload — the user reads the DOM.
  // Polled: the resolver reports `completed` before the composing bubble has been
  // swapped for the final one, and a single read lands on the empty ghost.
  await expect.poll(async () => {
    const thread = await readThread(frame).catch(() => []);
    entry.rendered = thread; save();
    return thread.filter((m) => m.role === 'assistant').some((m) => m.text.includes(entry.oracle.title));
  }, { timeout: 90_000, message: 'the title never reached the rendered bubble' }).toBe(true);
});
