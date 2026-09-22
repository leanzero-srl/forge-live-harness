// CONFLUENCE LIVE ACCEPTANCE — PART C: researchConfluence, from the DEFAULT
// persona, one sentence, one paid turn.
//
// The claim: a brief for a new joiner, five bullets, CITING PAGE TITLES — and
// every title it cites must be a page that really exists in WFH. A cited title
// nobody can find is a fabrication, which is worse than no citation.
// It also records WHICH tool did the work: researchConfluence (the nested
// synthesis) or a plain listSpaceContent — the second is a finding, not a pass.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  GLOBAL_APP, openGlobalPage, waitForChatApp, settleBootSelection, awaitSwapSettled,
  readAppState, deliverMessage, callResolver, logWindow, describeLogs, pickPersonaIfGated } from './chatwise-support';
// eslint-disable-next-line
import { get } from '../../data/jira.mjs';

const FOLDER = '/tmp/cw-confluence-live-2';
const JOURNAL = `${FOLDER}/part-c.json`;
const SPACE_ID = '851971';
const PROMPT = 'Research in Confluence space WFH: what is the WFH space about and what are its main pages? ' +
  'Brief: for a new joiner, five bullets, cite page titles.';

test.describe.configure({ retries: 0 });
test('C: a researched brief on WFH cites page titles that really exist', async ({ page }) => {
  test.skip(!process.env.CW_CONFLUENCE_C, 'Explicit paid acceptance opt-in required (CW_CONFLUENCE_C=1)');
  test.setTimeout(1_800_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  mkdirSync(FOLDER, { recursive: true });
  const prior = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, 'utf8')) : null;
  expect(prior, 'part C already ran — read the journal; never repeat a paid dispatch').toBeNull();
  const entry: any = { part: 'C', prompt: PROMPT, createdAt: new Date().toISOString(), events: [] };
  const save = () => {
    const tmp = `${JOURNAL}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(entry, null, 2));
    renameSync(tmp, JOURNAL);
  };
  save();

  // Every page title in WFH, as Confluence has it — the oracle for the citations.
  const titles: string[] = [];
  let cursor = `/wiki/api/v2/spaces/${SPACE_ID}/pages?limit=250`;
  for (let i = 0; i < 10 && cursor; i++) {
    const r: any = await get(cursor);
    for (const p of r.results || []) titles.push(String(p.title));
    const next = r._links?.next || null;
    cursor = next ? String(next) : '';
  }
  entry.spaceTitleCount = titles.length; save();

  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator('#newChatButton').click(); await pickPersonaIfGated(frame);
  await awaitSwapSettled(frame);
  entry.persona = await frame.locator('#dropdownSelected .selected-text').innerText();
  entry.conversationId = await readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()');
  entry.submittedAt = new Date().toISOString();
  save();
  const t0 = Date.parse(entry.submittedAt);
  await deliverMessage(page, frame, PROMPT, 'confluence part C');
  await expect.poll(async () => {
    const jobId = await readAppState<string | null>(frame, GLOBAL_APP, 'app.currentJobId');
    if (!jobId) return false;
    entry.jobId = jobId; save(); return true;
  }, { timeout: 120_000 }).toBe(true);

  const deadline = t0 + 900_000;
  for (;;) {
    const response: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: entry.jobId });
    expect(response.success).toBe(true);
    entry.snapshot = response.data;
    for (const event of response.data.result?.progressEvents || []) {
      if (!entry.events.some((o: any) => o.id === event.id)) entry.events.push(event);
    }
    save();
    if (['completed', 'failed', 'cancelled'].includes(response.data.status)) break;
    if (Date.now() >= deadline) {
      entry.cancel = await callResolver(frame, GLOBAL_APP, 'cancelJob', { jobId: entry.jobId });
      save();
      throw new Error('Bounded guard stopped part C. No resend.');
    }
    await page.waitForTimeout(3000);
  }
  entry.reply = String(entry.snapshot.result?.response || '');
  entry.model = entry.snapshot.result?.model;
  entry.usage = entry.snapshot.result?.usage;
  entry.nestedUsage = entry.snapshot.result?.nestedUsage ?? null;
  entry.toolLabels = entry.events.map((e: any) => e.label);
  save();
  console.log(`\n######## PART C reply (model=${entry.model} tokens=${JSON.stringify(entry.usage)})\n${entry.reply}\n`);
  console.log(`LABELS ${JSON.stringify(entry.toolLabels)}\nNESTED ${JSON.stringify(entry.nestedUsage)}`);

  const lines = await logWindow(page, (ls) => ls.some((l) => l.at >= t0 && /^\[Consumer\] toolset:/.test(l.text)),
    { label: 'part C consumer line', timeoutMs: 240_000 });
  const win = lines.filter((l) => l.at >= t0);
  entry.log = win.filter((l) => /\[Tools\]|\[Confluence\]|\[Research\]|toolset:/i.test(l.text)).map((l) => `${new Date(l.at).toISOString()} ${l.text}`);
  save();
  console.log(describeLogs(win.filter((l) => /\[Tools\]|\[Confluence\]|\[Research\]|toolset:/i.test(l.text))));
  const texts = win.map((l) => l.text).join('\n');
  entry.usedResearch = /\[Tools\] researchConfluence/.test(texts);
  entry.usedListSpaceContent = /\[Tools\] listSpaceContent/.test(texts);
  save();

  /* ------------------- THE CITATIONS, CHECKED ONE BY ONE ------------------ */
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[“”"’']/g, '').trim();
  const known = titles.map(norm);
  const cited = Array.from(new Set([
    ...(entry.reply.match(/\*\*([^*\n]{3,120})\*\*/g) || []).map((m: string) => m.slice(2, -2)),
    ...(entry.reply.match(/["“]([^"”\n]{3,120})["”]/g) || []).map((m: string) => m.slice(1, -1)),
  ].map((s) => String(s).trim()).filter((s) => s.length >= 3)));
  entry.cited = cited;
  entry.citationCheck = cited.map((c: string) => ({
    cited: c,
    exact: known.includes(norm(c)),
    fuzzy: known.some((k) => k.includes(norm(c)) || norm(c).includes(k)),
  }));
  entry.bulletCount = (entry.reply.match(/^\s*[-*•]\s+/gm) || []).length;
  save();
  console.log('CITATIONS', JSON.stringify(entry.citationCheck, null, 2));

  expect.soft(entry.snapshot.status, entry.reply.slice(0, 400)).toBe('completed');
  expect.soft(entry.usedResearch, `researchConfluence was never called (listSpaceContent=${entry.usedListSpaceContent}):\n${entry.log.join('\n').slice(0, 1500)}`).toBe(true);
  expect.soft(entry.nestedUsage, 'no nestedUsage on the result — the nested synthesis is unaccounted for').toBeTruthy();
  const matched = entry.citationCheck.filter((c: any) => c.fuzzy).length;
  expect.soft(matched, `no cited title matches a real WFH page:\n${JSON.stringify(entry.citationCheck, null, 2)}`).toBeGreaterThan(0);
  const unmatched = entry.citationCheck.filter((c: any) => !c.fuzzy).map((c: any) => c.cited);
  entry.unmatched = unmatched; save();
  expect.soft(unmatched, `the brief cites titles that do not exist in WFH`).toEqual([]);
  expect.soft(entry.bulletCount, `the brief is not five bullets (got ${entry.bulletCount})`).toBeGreaterThanOrEqual(4);
});
