// Natural-language request, real agent, independent REST oracle; two paid turns maximum.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from './chatwise-support';
import { request } from '../../data/jira.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

test.describe.configure({ retries: 0 });
test('administrator creates a project from a natural request and one confirmation', async ({ page }) => {
  test.skip(process.env.CW_ADMIN_NATURAL !== '1', 'Explicit paid acceptance opt-in required');
  test.setTimeout(1000000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const folder = '/tmp/cw-admin-natural-paid';
  mkdirSync(folder, { recursive: true });
  const journal = `${folder}/result.json`;
  const prior = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : null;
  const stamp = Date.now();
  const entry: any = prior || { key: `CT${String(stamp).slice(-7)}`, name: `[harness-test] ChatWise reliability ${stamp}`, conversationId: `conv_admin_natural_${stamp}`, turns: [] };
  const save = () => writeFileSync(journal, JSON.stringify(entry, null, 2));
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  const me = await request('GET', '/rest/api/3/myself');
  if (!prior) {
    const existing = await request('GET', `/rest/api/3/project/${entry.key}`, { raw: true });
    expect(existing.status).toBe(404);
    await callResolver(frame, GLOBAL_APP, 'createConversation', { conversationId: entry.conversationId, title: entry.name, personaId: 'jira-admin' });
    save();
  }
  expect(entry.cleaned, 'This accepted run is already cleaned; do not repeat it').not.toBe(true);
  for (const [index, message] of [
    `Create a company-managed Jira Software Scrum project called "${entry.name}" with key ${entry.key}. Make me the project lead.`,
    `Yes, create ${entry.key} exactly as previewed.`,
  ].entries()) {
    let turn = entry.turns[index];
    if (!turn) {
      if (index === 1) {
        expect(entry.turns[0].result?.status).toBe('completed');
        const before = await request('GET', `/rest/api/3/project/${entry.key}`, { raw: true });
        expect(before.status, 'Creation must wait for the preview confirmation').toBe(404);
        // One minute between paid user turns; do not rerun the first.
        const since = Date.now() - Date.parse(entry.turns[0].completedAt);
        if (since < 60000) await page.waitForTimeout(60000 - since);
      }
      turn = { state: 'submitting', message, submittedAt: new Date().toISOString() };
      entry.turns.push(turn); save();
      const queued = await callResolver<any>(frame, GLOBAL_APP, 'chat', { conversationId: entry.conversationId, message, personaId: 'jira-admin', personaLocked: true });
      turn.jobId = queued.jobId; turn.state = queued.success ? 'queued' : 'submission-uncertain'; save();
    }
    expect(turn.jobId, 'Inspect uncertain submission instead of resending').toBeTruthy();
    const deadline = Date.now() + 420000;
    while (!turn.result && Date.now() < deadline) {
      const snapshot = await callResolver<any>(frame, GLOBAL_APP, 'getJobStatus', { jobId: turn.jobId });
      turn.lastSnapshot = snapshot.data;
      if (['completed', 'failed', 'cancelled'].includes(snapshot.data?.status)) {
        turn.result = snapshot.data; turn.completedAt = new Date().toISOString();
      }
      save();
      if (!turn.result) await page.waitForTimeout(3000);
    }
    expect(turn.result?.status, 'No automatic paid retry').toBe('completed');
  }
  const created = await request('GET', `/rest/api/3/project/${entry.key}`);
  entry.created = { id: created.id, key: created.key, name: created.name, projectTypeKey: created.projectTypeKey, simplified: created.simplified, lead: created.lead.accountId };
  save();
  try {
    expect(created.key).toBe(entry.key);
    expect(created.name).toBe(entry.name);
    expect(created.projectTypeKey).toBe('software');
    expect(created.simplified).toBe(false);
    expect(created.lead.accountId).toBe(me.accountId);
    const boards = await request('GET', `/rest/agile/1.0/board?projectKeyOrId=${created.id}`);
    entry.boardReadback = boards.values.map((board: any) => ({ id: board.id, name: board.name, type: board.type }));
    save();
    expect(entry.boardReadback.some((board: any) => board.type === 'scrum'), 'Requested Scrum board is absent').toBe(true);
    expect(entry.turns[1].result.result.response).toContain(entry.key);
  } finally {
    // Delete only the positively identified fixture created by this run.
    if (created.key === entry.key && created.name === entry.name) {
      await request('DELETE', `/rest/api/3/project/${created.id}?enableUndo=true`);
      const after = await request('GET', `/rest/api/3/project/${created.id}`, { raw: true });
      entry.cleanupStatus = after.status; entry.cleaned = after.status === 404; save();
      expect(after.status).toBe(404);
    }
  }
});
