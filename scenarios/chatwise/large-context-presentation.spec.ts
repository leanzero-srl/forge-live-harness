// One paid user request, recorded before submission. Reruns only observe it.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver, awaitSwapSettled, readAppState } from './chatwise-support';
import { zipEntries, slideFileCount, readEntryText } from '../../data/zip.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test.describe.configure({ retries: 0 });
test('large source becomes a substantial downloadable presentation', async ({ page }) => {
  test.skip(process.env.CW_LARGE_DECK !== '1', 'Explicit paid acceptance opt-in required');
  test.setTimeout(1500000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const sourcePath = process.env.CW_LARGE_SOURCE;
  const promptPath = process.env.CW_LARGE_PROMPT;
  expect(sourcePath).toBeTruthy();
  expect(promptPath).toBeTruthy();
  const source = readFileSync(sourcePath!);
  // The text extractor removes NULs, trailing horizontal whitespace and outer
  // whitespace. Compare its complete normalized text, not the final newline.
  const extractedChars = source.toString('utf8').split('\u0000').join('').replace(/[ \t]+\n/g, '\n').trim().length;
  const prompt = readFileSync(promptPath!, 'utf8');
  const digest = createHash('sha256').update(source).digest('hex');
  const folder = '/tmp/cw-large-context-paid';
  mkdirSync(folder, { recursive: true });
  const journalPath = `${folder}/result.json`;
  const prior = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : null;
  const entry: any = prior || { sourcePath, sourceSha256: digest, sourceBytes: source.length, sourceChars: source.toString('utf8').length };
  const save = () => writeFileSync(journalPath, JSON.stringify(entry, null, 2));
  expect(entry.sourceSha256, 'Do not swap the source of an existing paid run').toBe(digest);
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  if (process.env.CW_EXPECT_VERSION) await expect(frame.locator('body')).toContainText(process.env.CW_EXPECT_VERSION);
  if (prior) {
    // Observation-only reruns must show the real conversation too, not merely
    // poll its job from an unrelated empty chat.
    await frame.locator(`.conversation-item[data-conversation-id="${entry.conversationId}"]`).click();
    await expect.poll(() => readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()'), { timeout: 45000 }).toBe(entry.conversationId);
    await awaitSwapSettled(frame);
  }
  if (!prior) {
    await frame.locator('#newChatButton').click();
    await awaitSwapSettled(frame);
    await frame.locator('#dropdownSelected').click();
    await frame.locator('.dropdown-option[data-persona-id="product-owner"]').click();
    const filename = 'large-programme-evidence.md';
    await frame.locator('#attachFileInput').setInputFiles({ name: filename, mimeType: 'text/markdown', buffer: source });
    const chip = frame.locator(`#attachmentRow .attachment-chip[data-filename="${filename}"]`);
    await expect(chip).toBeVisible({ timeout: 180000 });
    await expect(chip).not.toHaveClass(/uploading/);
    entry.conversationId = await readAppState(frame, GLOBAL_APP, 'app.getActiveConversationId()');
    const files = await callResolver<any>(frame, GLOBAL_APP, 'getChatFiles', { conversationId: entry.conversationId });
    const stored = files.files.find((f: any) => f.filename === filename);
    expect(stored.chars, 'The uploaded source was truncated before inference').toBe(extractedChars);
    expect(stored.truncated).toBe(false);
    entry.upload = stored;
    await frame.locator('#chatInput').fill(prompt);
    Object.assign(entry, { state: 'submitting', submittedAt: new Date().toISOString(), prompt });
    save();
    await frame.locator('#sendButton').click();
    const deadline = Date.now() + 45000;
    while (!entry.jobId && Date.now() < deadline) {
      entry.jobId = await readAppState(frame, GLOBAL_APP, 'app.currentJobId');
      if (!entry.jobId) await page.waitForTimeout(300);
    }
    entry.state = entry.jobId ? 'queued' : 'submission-uncertain';
    save();
  }
  const batchRepair = process.env.CW_LARGE_BATCH_REPAIR === '1' &&
    entry.jobId === 'job_1789064750706_p68xxn5zt' && entry.result?.status === 'cancelled';
  const boundedRepair = process.env.CW_LARGE_BOUNDED_REPAIR === '1' &&
    entry.jobId === 'job_1789067019118_xi0x1myps' && entry.result?.status === 'cancelled';
  const planningRepair = process.env.CW_LARGE_PLANNING_REPAIR === '1' &&
    process.env.CW_EXPECT_VERSION === 'v6.142.0' &&
    entry.jobId === 'job_1789067655468_rvsqv4fax' && entry.result?.status === 'completed' &&
    entry.result.result?.truncated === true;
  const incomplete = boundedRepair || batchRepair || entry.result?.status === 'failed' ||
    (entry.result?.status === 'completed' && entry.result.result?.truncated === true);
  if (prior && process.env.CW_LARGE_RETRY_FAILED === '1' && incomplete) {
    expect(entry.result.result?.decks || [], 'Never regenerate completed work').toHaveLength(0);
    const history = entry.previousAttempts || [];
    if (history.length > 0) {
      // Further attempts require the exact reviewed incomplete job, not a reusable
      // retry switch. No automatic refusal/model-fallback loop is permitted.
      expect(history.length, 'Paid retry ceiling reached; preserve the result').toBeLessThanOrEqual(planningRepair ? 5 : boundedRepair ? 4 : batchRepair ? 3 : 2);
      expect(process.env.CW_LARGE_REVIEWED_RESUME_JOB, 'Name the reviewed failed job explicitly').toBe(entry.jobId);
    }
    // Explicit repair retry only. Retain the complete failed attempt, and drive
    // the same owned conversation through the normal composer.
    const previous = JSON.parse(JSON.stringify(entry));
    delete previous.previousAttempts;
    await frame.locator('#chatInput').fill(prompt);
    delete entry.result; delete entry.lastSnapshot; delete entry.jobId;
    entry.previousAttempts = [...history, previous]; entry.visibleProgress = [];
    entry.state = 'submitting'; entry.submittedAt = new Date().toISOString(); save();
    await frame.locator('#sendButton').click();
    const deadline = Date.now() + 45000;
    while (!entry.jobId && Date.now() < deadline) {
      entry.jobId = await readAppState(frame, GLOBAL_APP, 'app.currentJobId');
      if (!entry.jobId) await page.waitForTimeout(300);
    }
    entry.state = entry.jobId ? 'queued' : 'submission-uncertain'; save();
  }
  expect(entry.jobId, 'Uncertain submission: inspect saved conversation; never auto-resend').toBeTruthy();
  const progress = new Set<string>(entry.visibleProgress || []);
  const deadline = Date.now() + 1200000;
  while (!entry.result && Date.now() < deadline) {
    const label = await frame.locator('.thinking-status').textContent().catch(() => null);
    if (label) progress.add(label);
    if (existsSync(`${folder}/STOP`)) {
      const before = await callResolver<any>(frame, GLOBAL_APP, 'getJobStatus', { jobId: entry.jobId });
      if (!['completed', 'failed', 'cancelled'].includes(before.data?.status)) {
        entry.stopRequestedAt = new Date().toISOString(); save();
        await callResolver<any>(frame, GLOBAL_APP, 'cancelJob', { jobId: entry.jobId });
      }
    }
    const snapshot = await callResolver<any>(frame, GLOBAL_APP, 'getJobStatus', { jobId: entry.jobId });
    entry.lastSnapshot = snapshot.data;
    if (['completed', 'failed', 'cancelled'].includes(snapshot.data?.status)) entry.result = snapshot.data;
    entry.visibleProgress = [...progress];
    save();
    if (!entry.result) await page.waitForTimeout(3000);
  }
  // Preserve completed files even if later narration failed.
  const result = entry.result?.result;
  for (const deck of result?.decks || []) {
    const got = await callResolver<any>(frame, GLOBAL_APP, 'getDeckContent', { handle: deck.handle, deckId: deck.handle });
    expect(got.success).toBe(true);
    const bytes = Buffer.from(got.base64, 'base64');
    const archive = zipEntries(bytes);
    const slides = slideFileCount(archive.names);
    const text = archive.names.filter((name: string) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a: string, b: string) => Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]))
      .map((name: string) => ({ name, xml: readEntryText(bytes, name) }));
    writeFileSync(`${folder}/${deck.filename || 'programme-review.pptx'}`, bytes);
    writeFileSync(`${folder}/slide-text.json`, JSON.stringify(text, null, 2));
    entry.artifact = { ...deck, verifiedBytes: bytes.length, slides };
    save();
    expect(deck.attached).toBe(false);
    expect(slides).toBeGreaterThanOrEqual(28);
    expect(slides).toBeLessThanOrEqual(35);
    expect(bytes.length).toBe(deck.sizeBytes);
  }
  if (entry.artifact) {
    // Reopen the stored conversation: verify the actual user's card, not just
    // the job DTO, then exercise its normal browser download gesture.
    await frame.locator(`.conversation-item[data-conversation-id="${entry.conversationId}"]`).click();
    await awaitSwapSettled(frame);
    const card = frame.locator(`.deck-card[data-deck-id="${entry.artifact.handle}"]`);
    await expect(card).toBeVisible({ timeout: 60000 });
    await expect(card).toContainText('30 slides');
    const button = card.getByRole('button', { name: 'Download', exact: true });
    await expect(button).toBeEnabled({ timeout: 60000 });
    const downloadEvent = page.waitForEvent('download', { timeout: 60000 });
    await button.click();
    const download = await downloadEvent;
    const downloadedPath = `${folder}/browser-download.pptx`;
    await download.saveAs(downloadedPath);
    const downloadedBytes = readFileSync(downloadedPath);
    const resolverBytes = readFileSync(`${folder}/${entry.artifact.filename}`);
    expect(downloadedBytes.equals(resolverBytes), 'Browser download differs from the generated file').toBe(true);
    entry.browserDownload = { filename: download.suggestedFilename(), bytes: downloadedBytes.length, verifiedAt: new Date().toISOString() };
    save();
  }
  await page.screenshot({ path: `${folder}/final.png`, fullPage: true });
  expect(entry.result?.status, 'No automatic paid retry').toBe('completed');
  expect(result?.decks || [], 'Completion without a functional presentation does not pass').toHaveLength(1);
  expect(entry.artifact).toBeTruthy();
  const coverage = result.sourceCoverage;
  expect(coverage, 'No measured source-reading record reached the completed job').toBeTruthy();
  expect(coverage.sourceChars).toBe(extractedChars);
  expect(coverage.completedChars).toBe(extractedChars);
  expect(coverage.completedChunks).toBe(coverage.chunks);
  expect(coverage.extractionTruncated).toBe(false);
  let end = 0;
  for (const range of coverage.ranges) {
    expect(range.fileIndex).toBe(0);
    expect(range.start).toBe(end);
    end = range.end;
  }
  expect(end).toBe(extractedChars);
  expect(coverage.usage.prompt_tokens).toBeGreaterThan(0);
  // Factual coverage and rendered layout review are separate acceptance gates.
});
