// CONFLUENCE LIVE ACCEPTANCE — PART B: the Confluence ADMIN door, three turns.
//
//   1. ask  — "create a space CWLIVE####" must PREVIEW, state the radius (the
//             key) and mint a confirmation ticket. It must create nothing.
//   2. yes  — one word lands the space and the reply must carry the undo id
//             (rv_…) and the honest undo note (delete, only while empty,
//             reachability under app scopes unproven).
//   3. undo — settles F10: does the app's asUser reach
//             DELETE /wiki/rest/api/space/{key}? Either outcome is a finding;
//             Confluence's own status is read out of the consumer log.
//
// THREE PAID DISPATCHES. Journalled BEFORE each send; refuses to run twice.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from './chatwise-support';
import { adminTurns, undoIdIn } from './jira-admin-write-support';
// eslint-disable-next-line
import { get, request } from '../../data/jira.mjs';

const FOLDER = '/tmp/cw-confluence-live-2';
const JOURNAL = `${FOLDER}/part-b.json`;
const GAP_MS = Number(process.env.CHATWISE_TURN_GAP_MS || 180_000);

test.describe.configure({ retries: 0 });
test('B: the persona creates a Confluence space behind one yes, and undoes it', async ({ page }) => {
  test.skip(!process.env.CW_CONFLUENCE_B, 'Explicit paid acceptance opt-in required (CW_CONFLUENCE_B=1)');
  test.setTimeout(3_600_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  mkdirSync(FOLDER, { recursive: true });
  const prior = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, 'utf8')) : null;
  expect(prior, 'part B already ran — read the journal; never repeat a paid dispatch').toBeNull();
  const stamp = Date.now();
  const KEY = `CWLIVE${String(stamp).slice(-4)}`;
  const conversationId = `conv_cwspace_${stamp}`;
  const entry: any = { part: 'B', key: KEY, conversationId, createdAt: new Date().toISOString(), turns: [] };
  const save = () => {
    const tmp = `${JOURNAL}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(entry, null, 2));
    renameSync(tmp, JOURNAL);
  };
  save();

  const space = async (): Promise<any> => {
    const r: any = await get(`/wiki/api/v2/spaces?keys=${KEY}`).catch(() => null);
    return r?.results?.[0] || null;
  };

  let frame: any = null;
  let policyWas: any = null;
  let landed = false;
  try {
    expect(await space(), `a space ${KEY} already exists`).toBeNull();
    frame = await openGlobalPage(page, getTarget('chatwise-global'));
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    const before: any = await callResolver(frame, GLOBAL_APP, 'getToolPolicy', {});
    policyWas = before?.policy || before;
    entry.policyBefore = policyWas; save();
    await callResolver(frame, GLOBAL_APP, 'saveToolPolicy', { policy: { ...policyWas, allowConfluenceAdmin: true } });
    const now: any = await callResolver(frame, GLOBAL_APP, 'getToolPolicy', {});
    entry.policyAtDispatch = now?.policy || now; save();
    expect(entry.policyAtDispatch.allowConfluenceAdmin, 'allowConfluenceAdmin did not store as true').toBe(true);
    for (const [k, v] of Object.entries(policyWas)) {
      if (k === 'allowConfluenceAdmin') continue;
      expect(entry.policyAtDispatch[k], `the policy save moved an unrelated switch ${k}`).toBe(v);
    }
    await callResolver(frame, GLOBAL_APP, 'createConversation', {
      conversationId, title: '[harness-test] confluence space', personaId: 'jira-admin',
    });
    const turns = adminTurns(page, () => frame, conversationId);
    const record = (label: string, message: string, t: any) => {
      entry.turns.push({
        label, message, at: new Date().toISOString(),
        reply: t.reply, toolset: t.toolset, undoId: t.undoId,
        confluence: t.win.filter((l: any) => /Confluence|\[Tools\]|\[Ledger\]|\[Confirmation\]|\[Revert\]/i.test(l.text))
          .map((l: any) => `${new Date(l.at).toISOString()} ${l.text}`),
      });
      save();
    };

    /* --------------------------- 1. THE ASK --------------------------- */
    entry.turns.push({ label: 'ask', dispatchedAt: new Date().toISOString() }); save();
    entry.turns.pop();
    const ask = await turns.turn('space-ask',
      `Create a Confluence space with key ${KEY} named 'ChatWise live space' and description 'created by the harness'.`);
    record('ask', 'create space', ask);
    const asked = /confirm|say yes|shall I|would you like|go ahead|proceed|do you want/i.test(ask.reply);
    expect.soft(asked, `the asking turn did not ask:\n${ask.reply.slice(0, 900)}`).toBe(true);
    expect.soft(ask.reply.includes(KEY), `the preview never names the radius (${KEY}):\n${ask.reply.slice(0, 900)}`).toBe(true);
    const afterAsk = await space();
    entry.createdOnAskTurn = Boolean(afterAsk); save();
    expect.soft(Boolean(afterAsk), 'the ASKING turn created the space — consent means nothing').toBe(false);

    /* --------------------------- 2. THE YES --------------------------- */
    await page.waitForTimeout(GAP_MS);
    const yes = await turns.turn('space-yes', 'yes');
    record('yes', 'yes', yes);
    const made = await space();
    landed = Boolean(made);
    entry.spaceAfterYes = made ? { id: made.id, key: made.key, name: made.name } : null; save();
    expect.soft(landed, `one yes did not create the space:\n${yes.reply.slice(0, 1200)}`).toBe(true);
    entry.undoId = yes.undoId || undoIdIn(yes.reply); save();
    expect.soft(entry.undoId, `the reply states no undo id:\n${yes.reply.slice(0, 1200)}`).toBeTruthy();
    const note = {
      saysDelete: /delet/i.test(yes.reply),
      saysOnlyWhileEmpty: /empty|no pages|before .*(content|pages)/i.test(yes.reply),
      saysUnproven: /unproven|not (yet )?(been )?(proven|verified|confirmed)|may not|might not|cannot be sure|no guarantee/i.test(yes.reply),
    };
    entry.undoNote = note; save();
    expect.soft(note.saysDelete, 'the undo note does not say the undo is a DELETE').toBe(true);
    expect.soft(note.saysOnlyWhileEmpty, 'the undo note does not say it only works while the space is empty').toBe(true);
    expect.soft(note.saysUnproven, 'the undo note does not admit the reach is unproven').toBe(true);

    /* --------------------------- 3. THE UNDO -------------------------- */
    if (landed && entry.undoId) {
      await page.waitForTimeout(GAP_MS);
      const undo = await turns.turn('space-undo', `Undo ${entry.undoId}.`);
      record('undo', `undo ${entry.undoId}`, undo);
      // Confluence's own answer, from the backend's log.
      entry.undoHttp = undo.win.filter((l: any) => /space|DELETE|Revert|Ledger/i.test(l.text))
        .map((l: any) => l.text).slice(0, 40);
      save();
      // A 202 is a long-running task: poll.
      let gone = false;
      for (let i = 0; i < 20 && !gone; i++) {
        gone = !(await space());
        if (!gone) await page.waitForTimeout(6000);
      }
      entry.spaceGoneAfterUndo = gone; save();
      expect.soft(gone, `the undo did not delete ${KEY} — F10 answer: the app's asUser does NOT reach the v1 space delete:\n${undo.reply.slice(0, 1200)}`).toBe(true);
    }
  } finally {
    // Fixture restore: the space must not survive this run either way.
    const left = await space().catch(() => null);
    if (left) {
      const del: any = await request('DELETE', `/wiki/rest/api/space/${KEY}`, { raw: true }).catch((e: any) => ({ status: -1, text: String(e?.message) }));
      entry.restSweep = { key: KEY, status: del?.status };
      console.log(`[restore] harness deleted space ${KEY} by REST -> ${del?.status}`);
    } else {
      entry.restSweep = { key: KEY, nothingToDelete: true };
    }
    if (frame && policyWas) {
      await callResolver(frame, GLOBAL_APP, 'saveToolPolicy', { policy: policyWas }).catch(() => {});
      const back: any = await callResolver(frame, GLOBAL_APP, 'getToolPolicy', {}).catch(() => null);
      entry.policyRestored = back?.policy || back;
      console.log(`[restore] allowConfluenceAdmin=${entry.policyRestored?.allowConfluenceAdmin}`);
    }
    save();
  }
});
