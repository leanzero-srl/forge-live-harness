// PROBE-0 — does `api.asUser().requestConfluence` actually work from the DEPLOYED
// Jira app? One paid inference turn, driven through the real composer on the global
// page. The journal is written BEFORE the dispatch and created exclusively ('wx'),
// so a crash, a retry or a second invocation can never buy a second turn: re-run
// with CW_CONFLUENCE_OBSERVE=1 to re-read the same job instead.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { BASE as JIRA_BASE, get } from '../../data/jira.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  GLOBAL_APP, openGlobalPage, waitForChatApp, settleBootSelection, awaitSwapSettled,
  readAppState, readThread, deliverMessage, callResolver,
} from './chatwise-support';

const FOLDER = '/tmp/cw-confluence-probe0';
const SPACE_KEY = 'WFH';
const SPACE_ID = '851971';
const HOME_ID = '852172';
const PROMPT =
  `In the Confluence space ${SPACE_KEY}, list the pages you can see and then read the home page ` +
  `and tell me its title and the first sentence.`;

/** Storage XHTML -> plain text, then the first sentence-ish run of prose. */
function firstSentenceFromStorage(storage: string): { text: string; first: string } {
  const text = String(storage)
    .replace(/<ac:[\s\S]*?<\/ac:[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const first = (text.match(/^[^.!?]{3,300}([.!?]|$)/)?.[0] || text.slice(0, 200)).trim();
  return { text, first };
}

test.describe.configure({ retries: 0 });
test('the deployed Jira app reaches Confluence as the user and reads the WFH home page', async ({ page }) => {
  test.skip(process.env.CW_CONFLUENCE_LIVE !== '1', 'Explicit paid acceptance opt-in required');
  test.setTimeout(900_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  expect(new URL(JIRA_BASE).hostname).toBe('wolfaenpak.atlassian.net');
  const observe = process.env.CW_CONFLUENCE_OBSERVE === '1';

  mkdirSync(FOLDER, { recursive: true });
  const journal = `${FOLDER}/result.json`;
  const prior = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : null;
  const entry: any = prior || {
    prompt: PROMPT, spaceKey: SPACE_KEY, homepageId: HOME_ID,
    createdAt: new Date().toISOString(), dispatchCount: 0, events: [], snapshots: [],
  };
  if (observe) {
    expect(prior, 'Observation requires the existing exclusive journal').toBeTruthy();
    expect(entry.jobId, 'Submission is uncertain: inspect it; never resend').toMatch(/^job_/);
    expect(entry.dispatchCount).toBe(1);
  } else {
    expect(prior, 'An earlier run exists. Use CW_CONFLUENCE_OBSERVE=1; never repeat a paid dispatch').toBeNull();
    writeFileSync(journal, JSON.stringify(entry, null, 2), { flag: 'wx' });
  }
  const save = () => {
    const tmp = `${journal}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(entry, null, 2));
    renameSync(tmp, journal);
  };

  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  const marker = (await frame.locator('body').innerText()).match(/v6\.(\d+)\.(\d+)/);
  expect(marker, 'no version marker on the global page').toBeTruthy();
  entry.observedVersion = marker![0];
  expect(Number(marker![1]), 'the Confluence group ships in 6.181.0').toBeGreaterThanOrEqual(181);
  save();

  if (!observe) {
    // The admin row must be ON (its default is on). Read only — never written here.
    const policy: any = await callResolver(frame, GLOBAL_APP, 'getToolPolicy');
    expect(policy.success).toBe(true);
    entry.policyAllowConfluence = policy.policy?.allowConfluence;
    save();
    expect(entry.policyAllowConfluence, 'allowConfluence is switched off; this probe would prove nothing')
      .not.toBe(false);

    // ORACLE, before the dispatch, over basic auth — independent of the app.
    const space: any = await get(`/wiki/api/v2/spaces?keys=${SPACE_KEY}`);
    const row = (space.results || [])[0];
    expect(String(row?.id)).toBe(SPACE_ID);
    const home: any = await get(`/wiki/api/v2/pages/${HOME_ID}?body-format=storage`);
    const body = firstSentenceFromStorage(home.body?.storage?.value || '');
    const pages: any = await get(`/wiki/api/v2/pages?space-id=${SPACE_ID}&limit=50`);
    entry.oracle = {
      spaceId: String(row.id), spaceName: row.name, homepageId: String(home.id),
      homepageTitle: home.title, firstSentence: body.first, plainTextHead: body.text.slice(0, 400),
      pageTitles: (pages.results || []).map((p: any) => p.title),
    };
    save();
    expect(entry.oracle.homepageTitle).toBe('WORK FOR HIRE Home');

    await settleBootSelection(page, frame);
    await frame.locator('#newChatButton').click();
    await awaitSwapSettled(frame);
    entry.persona = await frame.locator('#dropdownSelected .selected-text').innerText();
    entry.conversationId = await readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()');
    expect(entry.conversationId).toBeTruthy();
    expect(existsSync(`${FOLDER}/STOP.txt`)).toBe(false);
    entry.state = 'submitting';
    entry.dispatchCount = 1;
    entry.submittedAt = new Date().toISOString();
    save();
    await deliverMessage(page, frame, PROMPT, 'confluence probe-0'); // the only dispatch in this file
    await expect.poll(async () => {
      const jobId = await readAppState<string | null>(frame, GLOBAL_APP, 'app.currentJobId');
      if (!jobId) return false;
      entry.jobId = jobId; entry.state = 'queued'; save(); return true;
    }, { timeout: 90_000 }).toBe(true);
  }

  const deadline = Date.parse(entry.submittedAt) + 780_000;
  while (true) {
    const response: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: entry.jobId });
    expect(response.success).toBe(true);
    const current = response.data;
    entry.snapshot = current;
    for (const event of current.result?.progressEvents || []) {
      if (!entry.events.some((old: any) => old.id === event.id)) {
        entry.events.push({ ...event, observedAt: new Date().toISOString() });
      }
    }
    const fingerprint = JSON.stringify([current.status, current.result?.progressNote, current.result?.usage]);
    if (entry.lastFingerprint !== fingerprint) {
      entry.lastFingerprint = fingerprint;
      entry.snapshots.push({ at: new Date().toISOString(), status: current.status, progress: current.result?.progressNote, usage: current.result?.usage });
      console.log('CONFLUENCE_PROBE', current.status, current.result?.progressNote || '', current.result?.usage?.total_tokens || 0);
    }
    save();
    if (['completed', 'failed', 'cancelled'].includes(current.status)) break;
    const stop = existsSync(`${FOLDER}/STOP.txt`) || Date.now() >= deadline
      || (current.result?.usage?.total_tokens || 0) > 200_000 || current.status === 'retrying';
    if (stop) {
      entry.guardStoppedAt = new Date().toISOString();
      entry.cancel = await callResolver(frame, GLOBAL_APP, 'cancelJob', { jobId: entry.jobId });
      save();
      throw new Error('Bounded guard stopped this job. Inspect the saved receipt; no resend.');
    }
    await page.waitForTimeout(2500);
  }

  const result = entry.snapshot.result || {};
  entry.reply = String(result.response || '');
  entry.toolLabels = entry.events.map((e: any) => e.label);
  entry.rendered = await readThread(frame).catch(() => []);
  writeFileSync(`${FOLDER}/reply.txt`, entry.reply);
  writeFileSync(`${FOLDER}/events.json`, JSON.stringify(entry.events, null, 2));
  save();
  await page.screenshot({ path: `${FOLDER}/completed.png`, fullPage: true }).catch(() => {});

  // ACCEPTANCE — every clause, not the first one that goes green.
  expect(entry.snapshot.status, entry.reply.slice(0, 400)).toBe('completed');
  expect(result.usage?.total_tokens).toBeGreaterThan(0);
  const confluenceCalls = entry.toolLabels.filter((l: string) => /confluence|space content/i.test(String(l)));
  expect(confluenceCalls, `no Confluence tool ran. labels: ${JSON.stringify(entry.toolLabels)}`).not.toHaveLength(0);
  expect(
    confluenceCalls.some((l: string) => /read confluence page/i.test(l)),
    `no page read followed the listing. labels: ${JSON.stringify(entry.toolLabels)}`,
  ).toBe(true);
  expect(entry.reply, 'the exact home page title is missing from the reply').toContain(entry.oracle.homepageTitle);
  expect(
    entry.reply,
    'the reply claims Confluence is unavailable — that is the probe answering NO',
  ).not.toMatch(/no (access|confluence)|not (installed|available|connected)|cannot (access|reach|see) confluence|unavailable/i);
  entry.acceptance = { onePaidDispatch: true, confluenceToolRan: true, titleQuoted: true, noUnavailabilityClaim: true };
  save();
});
