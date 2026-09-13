// CONFLUENCE LIVE ACCEPTANCE — PART A: the three page writes in ONE turn, from
// the DEFAULT persona, driven through the composer like a person.
//
// The claim under test is not "the tools exist". It is: a user who names the
// whole job in one sentence gets it DONE — page, comment, label — without being
// asked to confirm anything (rule 8 / ask-once: the user already named the act),
// and the reply hands back the page id and a URL they can click.
//
// ONE PAID DISPATCH. The journal is written BEFORE the send and refuses a second
// run; re-observe with CW_CONFLUENCE_A=observe.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  GLOBAL_APP, openGlobalPage, waitForChatApp, settleBootSelection, awaitSwapSettled,
  readAppState, readThread, deliverMessage, callResolver, logWindow, describeLogs, scoreToolOutcome,
} from './chatwise-support';
// eslint-disable-next-line
import { get, request } from '../../data/jira.mjs';
// eslint-disable-next-line
import { getComments, getPageLabels, deletePage } from '../../data/confluence.mjs';

const FOLDER = '/tmp/cw-confluence-live';
const JOURNAL = `${FOLDER}/part-a.json`;
const SPACE_ID = '851971';
const COMMENT = 'Created by the live harness';
const LABEL = 'chatwise-probe';

test.describe.configure({ retries: 0 });
test('A: one sentence creates a Confluence page, comments on it and labels it', async ({ page }) => {
  test.skip(!process.env.CW_CONFLUENCE_A, 'Explicit paid acceptance opt-in required (CW_CONFLUENCE_A=1)');
  test.setTimeout(1_800_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const observe = process.env.CW_CONFLUENCE_A === 'observe';
  mkdirSync(FOLDER, { recursive: true });
  const prior = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, 'utf8')) : null;
  const stamp = prior?.stamp || new Date().toISOString().replace(/[:.]/g, '-');
  const TITLE = prior?.title || `ChatWise live probe ${stamp}`;
  const PROMPT = prior?.prompt ||
    `Create a Confluence page in space WFH titled '${TITLE}' with a short paragraph and a ` +
    `bullet list summarising what ChatWise is, then add a comment '${COMMENT}' on it and the ` +
    `label ${LABEL}.`;
  const entry: any = prior || { part: 'A', stamp, title: TITLE, prompt: PROMPT, createdAt: new Date().toISOString(), dispatchCount: 0, events: [] };
  if (observe) {
    expect(prior, 'nothing to observe — run the dispatch first').toBeTruthy();
  } else {
    expect(prior, 'part A already ran. Re-read it with CW_CONFLUENCE_A=observe; never repeat a paid dispatch').toBeNull();
    writeFileSync(JOURNAL, JSON.stringify(entry, null, 2), { flag: 'wx' });
  }
  const save = () => {
    const tmp = `${JOURNAL}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(entry, null, 2));
    renameSync(tmp, JOURNAL);
  };

  let createdId: string | null = null;
  try {
    const frame = await openGlobalPage(page, getTarget('chatwise-global'));
    await waitForChatApp(page, frame, GLOBAL_APP);
    await settleBootSelection(page, frame);

    if (observe) {
      const row = frame.locator(`#conversationsList .conversation-item[data-conversation-id="${entry.conversationId}"]`);
      await row.waitFor({ state: 'visible', timeout: 30_000 });
      await row.click();
      await awaitSwapSettled(frame);
    } else {
      // Nothing with this title may exist before the turn — otherwise the oracle
      // afterwards proves nothing about THIS dispatch.
      const before: any = await get(`/wiki/api/v2/pages?space-id=${SPACE_ID}&title=${encodeURIComponent(TITLE)}&limit=5`);
      expect(before.results?.length || 0, 'a page with this title already exists').toBe(0);
      await frame.locator('#newChatButton').click();
      await awaitSwapSettled(frame);
      entry.persona = await frame.locator('#dropdownSelected .selected-text').innerText();
      entry.conversationId = await readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()');
      entry.policyAtDispatch = await callResolver(frame, GLOBAL_APP, 'getToolPolicy');
      entry.submittedAt = new Date().toISOString();
      entry.dispatchCount = 1;
      save();
      await deliverMessage(page, frame, PROMPT, 'confluence part A');
      await expect.poll(async () => {
        const jobId = await readAppState<string | null>(frame, GLOBAL_APP, 'app.currentJobId');
        if (!jobId) return false;
        entry.jobId = jobId; save(); return true;
      }, { timeout: 120_000 }).toBe(true);
    }

    const t0 = Date.parse(entry.submittedAt);
    const deadline = t0 + 900_000;
    for (;;) {
      const response: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: entry.jobId });
      expect(response.success).toBe(true);
      entry.snapshot = response.data;
      for (const event of response.data.result?.progressEvents || []) {
        if (!entry.events.some((o: any) => o.id === event.id)) entry.events.push(event);
      }
      save();
      const status = response.data.status;
      if (['completed', 'failed', 'cancelled'].includes(status)) break;
      if (Date.now() >= deadline) {
        entry.cancel = await callResolver(frame, GLOBAL_APP, 'cancelJob', { jobId: entry.jobId });
        save();
        throw new Error('Bounded guard stopped part A. No resend.');
      }
      await page.waitForTimeout(3000);
    }

    entry.reply = String(entry.snapshot.result?.response || '');
    entry.model = entry.snapshot.result?.model;
    entry.usage = entry.snapshot.result?.usage;
    entry.toolLabels = entry.events.map((e: any) => e.label);
    save();
    console.log(`\n######## PART A reply (model=${entry.model} tokens=${JSON.stringify(entry.usage)})\n${entry.reply}\n`);
    console.log(`LABELS: ${JSON.stringify(entry.toolLabels)}`);

    // The backend's own account of the three calls.
    const lines = await logWindow(page, (ls) => ls.some((l) => l.at >= t0 && /\[Tools\] createConfluencePage/.test(l.text)),
      { label: 'createConfluencePage in the log', timeoutMs: 240_000 });
    const win = lines.filter((l) => l.at >= t0);
    entry.confluenceLog = win.filter((l) => /Confluence|\[Tools\]|toolset:/i.test(l.text)).map((l) => `${new Date(l.at).toISOString()} ${l.text}`);
    save();
    console.log(describeLogs(win.filter((l) => /\[Tools\]|Confluence|toolset:/i.test(l.text))));
    const texts = win.map((l) => l.text);
    entry.scores = {
      createConfluencePage: scoreToolOutcome('createConfluencePage', texts),
      addConfluenceComment: scoreToolOutcome('addConfluenceComment', texts),
      addConfluenceLabels: scoreToolOutcome('addConfluenceLabels', texts),
    };
    save();

    /* ---------------- THE ORACLE: Confluence's own answer ---------------- */
    const found: any = await get(`/wiki/api/v2/pages?space-id=${SPACE_ID}&title=${encodeURIComponent(TITLE)}&limit=5&body-format=storage`);
    const pageRow = found.results?.[0] || null;
    entry.oracle = { matched: found.results?.length || 0, id: pageRow?.id || null, spaceId: pageRow?.spaceId || null, titleSeen: pageRow?.title || null };
    save();
    expect.soft(entry.oracle.matched, `no page titled "${TITLE}" exists in WFH:\n${entry.reply.slice(0, 1200)}`).toBe(1);
    if (!pageRow) throw new Error('PART A FAILED: the page was never created — see the reply above.');
    createdId = String(pageRow.id);
    const storage = String(pageRow.body?.storage?.value || '');
    entry.oracle.bodyChars = storage.length;
    entry.oracle.hasUl = /<ul[\s>]/i.test(storage);
    entry.oracle.hasParagraph = /<p[\s>]/i.test(storage);
    entry.oracle.bodySample = storage.slice(0, 800);
    const comments = await getComments(createdId);
    entry.oracle.comments = comments.map((c: any) => (c.body?.storage?.value || '').slice(0, 200));
    entry.oracle.commentMatches = entry.oracle.comments.filter((c: string) => c.includes(COMMENT)).length;
    entry.oracle.labels = await getPageLabels(createdId);
    save();
    console.log('ORACLE', JSON.stringify(entry.oracle, null, 2));

    expect.soft(entry.snapshot.status, entry.reply.slice(0, 400)).toBe('completed');
    expect.soft(entry.oracle.spaceId, 'the page landed in a different space').toBe(SPACE_ID);
    expect.soft(entry.oracle.hasUl, `the stored body has no <ul> — the bullet list never became a list:\n${entry.oracle.bodySample}`).toBe(true);
    expect.soft(entry.oracle.hasParagraph, 'the stored body has no paragraph').toBe(true);
    expect.soft(entry.oracle.commentMatches, `footer comments carrying "${COMMENT}": ${JSON.stringify(entry.oracle.comments)}`).toBe(1);
    expect.soft(entry.oracle.labels, 'the label never landed').toContain(LABEL);
    // The USER-VISIBLE half: id and a clickable URL, in the words they read.
    entry.replyHasId = entry.reply.includes(createdId);
    entry.replyUrl = (entry.reply.match(/https?:\/\/\S*wolfaenpak\.atlassian\.net\/wiki\/\S+/) || [])[0] || null;
    save();
    expect.soft(entry.replyHasId, `the reply never gives the page id ${createdId}:\n${entry.reply.slice(0, 1200)}`).toBe(true);
    expect.soft(entry.replyUrl, `the reply gives no Confluence URL:\n${entry.reply.slice(0, 1200)}`).toBeTruthy();
    // ASK-ONCE: the user named the act, so a "shall I proceed" is a defect.
    const reAsked = /shall i (proceed|go ahead|create)|would you like me to (proceed|create)|do you want me to (proceed|create)|confirm (that )?you want/i.test(entry.reply);
    entry.reAsked = reAsked;
    save();
    expect.soft(reAsked, `the reply asked for confirmation of an act the user had already named:\n${entry.reply.slice(0, 800)}`).toBe(false);
    for (const tool of ['createConfluencePage', 'addConfluenceComment', 'addConfluenceLabels']) {
      expect.soft((entry.scores as any)[tool].status, `${tool}: ${(entry.scores as any)[tool].evidence}`).toBe('200');
    }
    // The rendered bubble, not just the resolver payload.
    await expect.poll(async () => {
      const thread = await readThread(frame).catch(() => []);
      entry.rendered = thread.map((m: any) => `${m.role}: ${m.text.slice(0, 300)}`); save();
      return thread.filter((m) => m.role === 'assistant').some((m) => m.text.includes(createdId as string));
    }, { timeout: 120_000, message: 'the page id never reached the rendered bubble' }).toBe(true);
  } finally {
    if (createdId) {
      const del: any = await deletePage(createdId).catch((e: any) => ({ status: -1, text: String(e?.message) }));
      entry.cleanup = { deletedPage: createdId, status: del?.status };
      console.log(`[restore] deleted page ${createdId} -> ${del?.status}`);
    } else {
      // A page may exist under the title even if the assertions never got there.
      const sweep: any = await get(`/wiki/api/v2/pages?space-id=${SPACE_ID}&title=${encodeURIComponent(TITLE)}&limit=5`).catch(() => null);
      const stray = sweep?.results?.[0]?.id || null;
      if (stray) {
        await deletePage(String(stray)).catch(() => {});
        entry.cleanup = { sweptStray: stray };
        console.log(`[restore] swept stray page ${stray}`);
      } else {
        entry.cleanup = { nothingToDelete: true };
      }
    }
    save();
  }
});
