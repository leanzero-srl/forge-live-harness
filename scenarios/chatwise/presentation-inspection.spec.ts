// Read-only owned inspection. No chat, queue, resume, model call or source upload.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from './chatwise-support';

const GROUPS = process.env.CW_PRESENTATION_INSPECT_GROUPS === '1';
const FOLDER = GROUPS ? '/tmp/cw-presentation-inspection-179' : '/tmp/cw-presentation-inspection-175';
const JOURNAL = GROUPS ? '/tmp/cw-large-context-paid/review-result-v6178-attempt21.json' : '/tmp/cw-large-context-paid/review-result.json';
const JOB = 'job_1789069156385_review9d3777857a88a085';
const CONVERSATION = 'conv_1789061368239_6fi8y9m66';
const CORPUS = 'a18875aef38f2655597fa455bbe5681dabf61210de332cc4e87e498b94fb621c';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

test.describe.configure({ retries: 0 });
test('inspect every owned presentation evidence cell and saved claim receipt without work dispatch', async ({ page }) => {
  test.skip(process.env.CW_PRESENTATION_INSPECT !== '1', 'Explicit read-only inspection required');
  test.setTimeout(360_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const version = process.env.CW_EXPECT_VERSION || (GROUPS ? 'v6.179.0' : 'v6.175.0');
  expect(version).toMatch(/^v6\.\d+\.0$/);
  const draftId = 'cbf05b7c635ae0b44ee658069d4b3d2f4a6e184f7df4405747f9a3b9fa6fa9e4'; // Retained v174 worker tool receipt.
  const originalJournal = readFileSync(JOURNAL, 'utf8');
  const saved = JSON.parse(originalJournal);
  expect(saved.jobId).toBe(JOB); expect(saved.conversationId).toBe(CONVERSATION);
  expect(saved.resumeAttempts).toHaveLength(GROUPS ? 21 : 20);
  expect(saved.result.result.finishedAt).toBe(GROUPS ? '2026-09-12T19:18:49.176Z' : '2026-09-12T18:23:27.452Z');
  expect(saved.result.result.usage.total_tokens).toBe(GROUPS ? 89091 : 86434);
  mkdirSync(FOLDER, { recursive: true });
  expect(existsSync(`${FOLDER}/request.json`), 'Preserve prior inspection; never overwrite its evidence').toBe(false);
  writeFileSync(`${FOLDER}/request.json`, JSON.stringify({ jobId: JOB, conversationId: CONVERSATION, draftId, expectedVersion: version, requestedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  await expect(frame.locator('body')).toContainText(version);
  const before: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: JOB });
  writeFileSync(`${FOLDER}/before.json`, JSON.stringify(before, null, 2), { flag: 'wx' });
  expect(before.success).toBe(true);
  expect(before.data.status).toBe('completed');
  expect(before.data.result.conversationId).toBe(CONVERSATION);
  expect(before.data.result.finishedAt).toBe(saved.result.result.finishedAt);
  expect(before.data.result.usage).toEqual(saved.result.result.usage);
  expect(before.data.result.sourceCoverage.corpusHash).toBe(CORPUS);
  let catalogue: any;
  const cells: any[] = [], records: any[] = [];
  const pageNames: string[] = [];
  for (let cellIndex = 0; cellIndex < (catalogue?.cells.length || 1); cellIndex++) {
    let recordOffset = 0;
    const cellRecords: any[] = [];
    for (let pageNumber = 0; ; pageNumber++) {
      expect(pageNumber).toBeLessThan(257);
      const response: any = await callResolver(frame, GLOBAL_APP, 'inspectPresentationReview', { jobId: JOB, cellIndex, recordOffset });
      const filename = `cell-${cellIndex}-offset-${recordOffset}.json`;
      writeFileSync(`${FOLDER}/${filename}`, JSON.stringify(response, null, 2), { flag: 'wx' }); pageNames.push(filename);
      expect(response.success, response.error || 'An absent source/receipt part must fail visibly').toBe(true);
      const data = response.data;
      expect(data.draftId).toBe(draftId);
      expect(data.slideCount).toBe(30);
      expect(data.sourceBinding.corpusHash).toBe(CORPUS);
      expect(data.sourceBinding.evidenceHash).toBe(data.evidenceHash);
      expect(data.cells.length).toBeGreaterThan(0); expect(data.cells.length).toBeLessThanOrEqual(12);
      const stable = { cells: data.cells, sourceBinding: data.sourceBinding, evidenceHash: data.evidenceHash, receiptInventory: data.receiptInventory, usageEntries: data.usageEntries };
      if (!catalogue) catalogue = stable;
      else expect(stable, 'Inspection pages must describe the same immutable evidence and receipts').toEqual(catalogue);
      const cell = data.cell;
      expect(cell.index).toBe(cellIndex);
      expect(typeof cell.text).toBe('string'); expect(cell.text.length).toBeGreaterThan(0);
      expect(cell.text.length).toBe(data.cells[cellIndex].chars);
      expect(cell.end - cell.start).toBe(cell.text.length);
      expect(sha(cell.text)).toBe(cell.hash); expect(cell.hash).toBe(data.cells[cellIndex].hash);
      expect(Buffer.byteLength(cell.text)).toBe(cell.bytes);
      if (pageNumber === 0) cells.push(cell); else expect(cell).toEqual(cells[cellIndex]);
      expect(Array.isArray(data.records)).toBe(true); expect(data.records.length).toBeLessThanOrEqual(2);
      for (const record of data.records) {
        if (record.pending) {
          expect(record.rawText).toBeNull(); expect(record.report).toBeNull();
        } else {
          expect(typeof record.rawText).toBe('string');
          expect(sha(record.rawText)).toBe(record.rawHash);
          expect(Buffer.byteLength(record.rawText)).toBe(record.rawBytes);
        }
        expect(cellRecords.some(old => old.revisionId === record.revisionId && old.stage === record.stage)).toBe(false);
        cellRecords.push(record); records.push({ cellIndex, ...record });
      }
      if (data.nextRecordOffset === null) break;
      expect(Number.isSafeInteger(data.nextRecordOffset)).toBe(true);
      expect(data.nextRecordOffset).toBe(recordOffset + data.records.length);
      expect(data.nextRecordOffset).toBeGreaterThan(recordOffset); expect(data.nextRecordOffset).toBeLessThanOrEqual(512);
      recordOffset = data.nextRecordOffset;
    }
    const expectedRecords = catalogue.receiptInventory.filter((item: any) => item.cellIndex === cellIndex);
    expect(cellRecords.map(({ revisionId, stage }) => ({ revisionId, stage }))).toEqual(expectedRecords.map(({ revisionId, stage }: any) => ({ revisionId, stage })));
  }
  expect(records.length, 'No saved claim evidence was returned').toBeGreaterThan(0);
  if (GROUPS) {
    const correction = records.filter(record => record.stage === 'claim-group-v1-b8e9dbf04f0cdd82ffc06d6dbf2269cc93fb6add8fab661d6b1ed478c92a005d-cell-0-group-0');
    expect(correction).toHaveLength(1);
    expect(correction[0].rawText.length).toBe(179);
    expect(correction[0].pending).toBe(false); expect(correction[0].truncated).toBe(false);
    expect(correction[0].report).toBeNull();
  }
  const files: { name: string; text: string }[] = [];
  let end = 0;
  for (const cell of cells) {
    expect(cell.start, 'Prepared cells must cover every character without a gap or overlap').toBe(end); end = cell.end;
    if (!files[cell.fileIndex]) files[cell.fileIndex] = { name: cell.name, text: '' };
    expect(files[cell.fileIndex].name).toBe(cell.name); files[cell.fileIndex].text += cell.text;
  }
  for (let index = 1; index < files.length; index++) {
    expect(files[index].text.startsWith('\n\n')).toBe(true); files[index].text = files[index].text.slice(2);
  }
  expect(sha(JSON.stringify(files)), 'Every prepared byte must reconstruct the immutable evidence hash').toBe(catalogue.evidenceHash);
  expect(catalogue.sourceBinding.files.reduce((n: number, file: any) => n + file.chars, 0)).toBe(399574);
  const after: any = await callResolver(frame, GLOBAL_APP, 'getJobStatus', { jobId: JOB });
  writeFileSync(`${FOLDER}/after.json`, JSON.stringify(after, null, 2), { flag: 'wx' });
  expect(after).toEqual(before);
  expect(readFileSync(JOURNAL, 'utf8')).toBe(originalJournal);
  writeFileSync(`${FOLDER}/result.json`, JSON.stringify({ jobId: JOB, conversationId: CONVERSATION, draftId, observedVersion: version, pageNames, ...catalogue, cells, records, verifiedAt: new Date().toISOString(), readOnlyReceiptUnchanged: true }, null, 2), { flag: 'wx' });
});
