// Paid acceptance is single-dispatch and journaled. Never resend an uncertain turn.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { request } from '../../data/jira.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, settleBootSelection, awaitSwapSettled, readAppState, sendMessage, callResolver } from './chatwise-support';

test.describe.configure({ retries: 0 });
test('one delegated project request and one 100-issue request finish without repeated approval', async ({ page }) => {
  test.skip(process.env.CW_DURABLE_LIVE !== '1', 'Explicit paid acceptance only');
  test.setTimeout(5_400_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  expect(process.env.CW_EXPECT_VERSION).toMatch(/^v6\.\d+\.0$/);
  const protocolRepair = process.env.CW_DURABLE_PROTOCOL_REPAIR === '1';
  if (protocolRepair) {
    expect(process.env.CW_EXPECT_VERSION).toBe('v6.170.0');
    const previous = JSON.parse(readFileSync('/tmp/cw-durable-issues-20260912/result.json', 'utf8'));
    expect(previous.turns).toHaveLength(1);
    expect(previous.turns[0].jobId).toBe('job_1789228182619_12dzkbsva');
    expect(previous.turns[0].snapshot.status).toBe('completed');
    expect(previous.turns[0].snapshot.result.usage.total_tokens).toBe(96273);
    expect(previous.turns[0].snapshot.result.executedWrites?.length || 0).toBe(0);
  }
  const folder = protocolRepair ? '/tmp/cw-durable-issues-20260912-v6170' : '/tmp/cw-durable-issues-20260912';
  mkdirSync(folder, { recursive: true });
  const journal = `${folder}/result.json`;
  const existing = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : null;
  const entry: any = existing || { createdAt: new Date().toISOString(), projectKey: `DL${String(Date.now()).slice(-7)}`, turns: [] };
  const save = () => { const temporary = `${journal}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify(entry, null, 2)); renameSync(temporary, journal); };
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  await expect(frame.locator('body')).toContainText(process.env.CW_EXPECT_VERSION!);
  const poll = async (turn: any) => {
    const until = Date.now() + 4_800_000;
    let last = '';
    while (Date.now() < until) {
      const response: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: turn.jobId });
      expect(response.success).toBe(true);
      turn.snapshot = response.data;
      expect(response.data.result?.conversationId).toBe(entry.conversationId);
      for (const event of response.data.result?.progressEvents || []) {
        if (!(turn.events ||= []).some((old: any) => old.label === event.label)) turn.events.push({ label: event.label, observedAt: new Date().toISOString() });
      }
      const label = response.data.result?.progressNote || response.data.status;
      if (label !== last) {
        last = label;
        (turn.progress ||= []).push({ label, at: new Date().toISOString() });
        console.log('DURABLE_PROGRESS', label);
      }
      save();
      if (['completed', 'failed', 'cancelled'].includes(response.data.status)) return response.data;
      if (existsSync(`${folder}/STOP.txt`)) {
        turn.cancel = await callResolver(frame, GLOBAL_APP, 'cancelJob', { jobId: turn.jobId }); save();
        throw new Error('Operator stopped the run; do not resend it');
      }
      await page.waitForTimeout(4000);
    }
    throw new Error('Monitoring ended; inspect the saved job rather than resending');
  };
  if (process.env.CW_DURABLE_OBSERVE === '1') {
    expect(existing).toBeTruthy();
    expect(entry.turns.at(-1)?.jobId).toBeTruthy();
    await poll(entry.turns.at(-1));
    return;
  }
  expect(existing, 'A prior paid run exists; use observation instead of resending').toBeNull();
  // Exclusive creation claims this acceptance run even across two processes.
  writeFileSync(journal, JSON.stringify(entry, null, 2), { flag: 'wx' });
  expect(existsSync(`${folder}/STOP.txt`), 'Remove an intentional stop only after inspecting its existing run').toBe(false);
  await settleBootSelection(page, frame);
  await frame.locator('#newChatButton').click();
  await awaitSwapSettled(frame);
  await frame.locator('#dropdownSelected').click();
  await frame.locator('#dropdownOptions .dropdown-option[data-persona-id="jira-admin"]').click();
  await expect(frame.locator('#dropdownSelected .selected-text')).toHaveText('Jira Administrator');
  entry.conversationId = await readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()');
  expect(entry.conversationId).toBeTruthy();
  save();
  const turn = async (message: string) => {
    expect(existsSync(`${folder}/STOP.txt`), 'Stopped before dispatch; no paid turn sent').toBe(false);
    const item: any = { message, requestedAt: new Date().toISOString() };
    entry.turns.push(item); save(); // before any potentially paid dispatch
    await sendMessage(page, frame, message);
    await expect.poll(async () => {
      const id = await readAppState(frame, GLOBAL_APP, 'app.currentJobId');
      if (id && !entry.turns.slice(0, -1).some((t: any) => t.jobId === id)) { item.jobId = id; save(); return true; }
      return false;
    }, { timeout: 60000 }).toBe(true);
    const result = await poll(item);
    expect(result.status).toBe('completed');
    expect(result.result?.truncated, result.result?.response).not.toBe(true);
    await expect.poll(() => readAppState(frame, GLOBAL_APP, 'app.components.chat.isStreaming'), { timeout: 120000 }).toBe(false);
    return result.result;
  };
  await turn(`Create a company-managed Jira Software Scrum project named "[harness-test] Durable delivery ${entry.projectKey}" with key ${entry.projectKey}. Use me as lead. Choose all other supported defaults and create it now; I delegate those choices to you.`);
  const project: any = await request('GET', `/rest/api/3/project/${entry.projectKey}`);
  expect(project.key).toBe(entry.projectKey);
  expect(project.projectTypeKey).toBe('software');
  expect(project.simplified).toBe(false);
  expect(project.name).toBe(`[harness-test] Durable delivery ${entry.projectKey}`);
  const myself: any = await request('GET', '/rest/api/3/myself');
  expect(project.lead.accountId).toBe(myself.accountId);
  entry.project = { key: project.key, id: project.id, name: project.name }; save();
  const issueResult = await turn('In that project, create exactly 100 distinct standard-level tasks for launching a parcel locker service. Cover resident access, courier deposits, notifications, locker operations, security, support, accessibility, monitoring and rollout. Give every task a specific summary and a substantial description with context, implementation steps and testable acceptance criteria. Choose the available issue type and appropriate values for all supported create-screen fields; I delegate those choices. Leave genuinely unavailable optional fields out and explain the omissions. Create all 100 now without asking me to approve batches.');
  const issues: any[] = [];
  const pageTokens = new Set<string>();
  let nextPageToken: string | undefined;
  do {
    const result: any = await request('POST', '/rest/api/3/search/jql', { body: {
      jql: `project = ${entry.projectKey} ORDER BY key ASC`, maxResults: 100, fields: ['*all'], ...(nextPageToken ? { nextPageToken } : {}),
    } });
    expect(Array.isArray(result.issues)).toBe(true);
    issues.push(...result.issues);
    if (result.isLast !== true) {
      expect(typeof result.nextPageToken, 'An incomplete search page needs a continuation token').toBe('string');
      expect(result.nextPageToken.length).toBeGreaterThan(0);
      expect(pageTokens.has(result.nextPageToken), 'Search pagination repeated a token').toBe(false);
      pageTokens.add(result.nextPageToken);
    }
    nextPageToken = result.isLast === true ? undefined : result.nextPageToken;
    expect(pageTokens.size).toBeLessThan(10);
  } while (nextPageToken);
  entry.issues = issues; entry.verifiedAt = new Date().toISOString(); save();
  expect(issues).toHaveLength(100);
  expect(new Set(issues.map(issue => issue.key)).size).toBe(100);
  expect(new Set(issues.map(issue => issue.fields.summary.trim().toLowerCase())).size).toBe(100);
  const plain = (node: any): string => node?.text || (node?.content || []).map(plain).join('\n');
  const typeIds = [...new Set(issues.map(issue => issue.fields.issuetype.id))];
  const types = new Map<string, any>();
  for (const typeId of typeIds) types.set(typeId, await request('GET', `/rest/api/3/issuetype/${typeId}`));
  const createFields = new Map<string, any[]>();
  for (const typeId of typeIds) {
    const fields: any[] = []; let offset = 0; let complete = false;
    for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
      const metadata: any = await request('GET', `/rest/api/3/issue/createmeta/${entry.projectKey}/issuetypes/${typeId}?startAt=${offset}&maxResults=100`);
      const values = metadata.fields || metadata.values;
      expect(Array.isArray(values)).toBe(true); fields.push(...values); offset += values.length;
      if (metadata.isLast === true || (Number.isFinite(metadata.total) && offset >= metadata.total)) { complete = true; break; }
      expect(values.length, 'Create metadata pagination must advance').toBeGreaterThan(0);
    }
    expect(complete, 'Every create field must be inspected').toBe(true); createFields.set(typeId, fields);
  }
  entry.createMetadata = Object.fromEntries(createFields);
  expect(new Set(issues.map(issue => plain(issue.fields.description).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim())).size).toBe(100);
  entry.qualityReview = issues.map(issue => ({ key: issue.key, summary: issue.fields.summary, description: plain(issue.fields.description), populatedCustomFields: Object.entries(issue.fields).filter(([key, value]) => key.startsWith('customfield_') && value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0)).map(([key, value]) => ({ key, value })) }));
  save();
  for (const issue of issues) {
    expect(issue.fields.project.key).toBe(entry.projectKey);
    expect(issue.fields.issuetype.subtask).toBe(false);
    expect(types.get(issue.fields.issuetype.id)?.hierarchyLevel).toBe(0);
    expect(issue.fields.summary.length).toBeGreaterThan(12);
    expect(plain(issue.fields.description).length, issue.key).toBeGreaterThan(300);
    expect(plain(issue.fields.description).split(/\n/).filter(line => line.trim()).length, `${issue.key}: context, work and acceptance must be readable`).toBeGreaterThanOrEqual(3);
    expect(issueResult.response).toContain(issue.key);
    for (const field of createFields.get(issue.fields.issuetype.id) || []) {
      if (!field.fieldId?.startsWith('customfield_') || (field.operations?.length && !field.operations.includes('set'))) continue;
      const value = issue.fields[field.fieldId];
      const populated = value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
      if (!populated) expect(issueResult.response, `${issue.key}: omitted create-screen field ${field.fieldId} must be disclosed`).toContain(field.fieldId);
    }
  }
  expect(entry.turns).toHaveLength(2);
  expect(new Set(entry.turns.map((item: any) => item.jobId)).size).toBe(2);
  expect(issueResult.usage?.total_tokens).toBeGreaterThan(0);
  entry.expectedWorkflow = { plannedIssueBatches: 20, executionBatches: 4, issueJobId: entry.turns[1].jobId, dispatchCount: 1, actualInternalCallCountRequiresWorkerLogs: true };
  expect(issueResult.response).toContain('Created all 100');
  expect(entry.turns[1].progress.some((p: any) => /Prepared|Created|Continuing|Saved/.test(p.label))).toBe(true);
  await page.reload();
  await waitForChatApp(page, frame, GLOBAL_APP);
  await frame.locator(`.conversation-item[data-conversation-id="${entry.conversationId}"]`).click();
  await awaitSwapSettled(frame);
  await expect(frame.locator('.message.assistant').last()).toContainText('Created all 100');
  await page.screenshot({ path: `${folder}/completed.png`, fullPage: true });
  entry.acceptance = { count: 100, all100IssuesReadBack: true, rawJiraFieldsSaved: true, descriptionsStructurallyChecked: true, reloadedReceipt: true, semanticReviewPending: true };
  save();
});
