// PREFLIGHT for the Confluence live acceptance (A/B/C). NO inference, no writes
// to Confluence. It answers the three questions that would otherwise waste a
// PAID turn on a trivial cause:
//   1. does the global page boot and which persona is selected at boot,
//   2. what does the stored tool policy say TODAY (recorded, so the restore at
//      the end of the run has a real "before" to go back to),
//   3. is the Confluence group actually reachable for this user (REST oracle on
//      the WFH space, independent of the app).
// Run it before every paid Confluence turn; it costs nothing.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, settleBootSelection, callResolver } from './chatwise-support';
import { get } from '../../data/jira.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const FOLDER = '/tmp/cw-confluence-live';

test.describe.configure({ retries: 0 });
test('preflight: page boots, policy readable, Confluence WFH reachable', async ({ page }) => {
  test.setTimeout(240_000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  mkdirSync(FOLDER, { recursive: true });
  const frame = await openGlobalPage(page, getTarget('chatwise-global'));
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  const persona = await frame.locator('#dropdownSelected .selected-text').innerText();
  const policy: any = await callResolver(frame, GLOBAL_APP, 'getToolPolicy');
  const space: any = await get('/wiki/api/v2/spaces?keys=WFH');
  const evidence = {
    measuredAt: new Date().toISOString(),
    bootPersona: persona,
    policy: policy?.policy ?? policy,
    wfhSpaceId: space.results?.[0]?.id ?? null,
  };
  writeFileSync(`${FOLDER}/preflight.json`, JSON.stringify(evidence, null, 2));
  console.log('PREFLIGHT', JSON.stringify(evidence, null, 2));
  expect(evidence.wfhSpaceId).toBe('851971');
  expect(typeof (evidence.policy as any)?.allowConfluence).toBe('boolean');
});
