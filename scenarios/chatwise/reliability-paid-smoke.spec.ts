// Explicitly opt-in: exactly two messages, no retries and no Jira writes.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver, awaitSwapSettled } from './chatwise-support';
import { zipEntries, slideFileCount, readEntryText } from '../../data/zip.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { get } from '../../data/jira.mjs';
import { secret } from './admin-credentials-support';
const T = getTarget('chatwise-global');
test.describe.configure({ retries: 0 });
test('two-turn reliability acceptance: admin discovery and Product Owner deck', async ({ page }) => {
  test.skip(process.env.CW_PAID_SMOKE !== '1', 'Explicit paid inference opt-in required');
  test.setTimeout(900000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const project = await get('/rest/api/3/project/WFH');
  expect(project.key).toBe('WFH');
  const orgResponse = await fetch(`https://api.atlassian.com/admin/v1/orgs/${secret('.org_id')}`, {
    headers: {Authorization:`Bearer ${secret('.org_key')}`, Accept:'application/json'},
  });
  expect(orgResponse.status).toBe(200);
  const orgName = (await orgResponse.json()).data.attributes.name;
  expect(typeof orgName).toBe('string');
  const folder = '/tmp/cw-reliability-paid';
  mkdirSync(folder, {recursive:true});
  const evidencePath = `${folder}/result.json`;
  const resumePresentation = process.env.CW_RESUME_PRESENTATION === '1';
  const evidence: any[] = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath,'utf8')) : [];
  if (resumePresentation) {
    expect(evidence).toHaveLength(1);
    expect(evidence[0].persona).toBe('jira-admin');
    expect(evidence[0].result?.status).toBe('completed');
  } else {
    expect(evidence, 'An earlier paid run exists. Do not resend completed or uncertain work.').toHaveLength(0);
  }
  for (const scenario of [
    { persona: 'jira-admin', prompt: 'Read-only check: use discoverAdminCapabilities to discover the documented public Jira getProject operation, then use readJiraApi with that operation to read project WFH. Also use readOrgApi operation getOrgById with empty parameters to read the configured organisation. Report the exact project key and name, and organisation name from the APIs. Do not create, update or delete anything. Keep your answer to two sentences.' },
    { persona: 'product-owner', prompt: 'Create a downloadable PowerPoint now, not an Epic or wizard. Apply the diconium brand skill if available and use the presentation guide. No Jira attachment or Jira writes. Exactly four varied slides: cover titled Delivery confidence; metrics showing 24 delivered, 6 remaining, 80% complete; a comparison of current manual reporting versus automated reporting; and next steps with three milestones. This is illustrative data, not measured Jira data. Give me the file.' },
  ]) {
    if (resumePresentation && scenario.persona !== 'product-owner') continue;
    await frame.locator('#newChatButton').click();
    await awaitSwapSettled(frame);
    await frame.locator('#dropdownSelected').click();
    await frame.locator(`.dropdown-option[data-persona-id="${scenario.persona}"]`).click();
    await frame.locator('#chatInput').fill(scenario.prompt);
    const entry: any = {persona:scenario.persona, state:'submitting', submittedAt:new Date().toISOString()};
    evidence.push(entry);
    writeFileSync(evidencePath, JSON.stringify(evidence,null,2));
    await frame.locator('#sendButton').click();
    let jobId: string | null = null;
    const queuedDeadline = Date.now() + 45000;
    while (!jobId && Date.now() < queuedDeadline) {
      jobId = await frame.locator('body').evaluate(() => (window as any).chatWiseGlobal.currentJobId);
      if (!jobId) await page.waitForTimeout(300);
    }
    expect(jobId, 'message did not enqueue').toBeTruthy();
    Object.assign(entry, {jobId, state:'queued'});
    writeFileSync(evidencePath, JSON.stringify(evidence,null,2));
    const visible = new Set<string>();
    let result: any;
    const deadline = Date.now() + 360000;
    while (Date.now() < deadline) {
      const label = await frame.locator('.thinking-status').textContent();
      if (label) visible.add(label);
      const snapshot = await callResolver<any>(frame, GLOBAL_APP, 'getJobStatus', {jobId});
      if (['completed','failed','cancelled'].includes(snapshot.data?.status)) { result = snapshot.data; break; }
      await page.waitForTimeout(2000);
    }
    Object.assign(entry, {visibleProgress:[...visible], result});
    writeFileSync(`${folder}/result.json`, JSON.stringify(evidence,null,2));
    expect(result?.status, 'turn failed or exceeded bounded wait; no paid retry').toBe('completed');
    const events = result.result.progressEvents || [];
    expect(events.length, 'no real progress arrived').toBeGreaterThan(0);
    expect([...visible].some(label => /running|finished|reviewing|preparing/i.test(label)), 'UI never showed real work').toBe(true);
    if (scenario.persona === 'jira-admin') {
      expect(events.some((e: any) => /discover admin capabilities/i.test(e.label))).toBe(true);
      expect(events.some((e: any) => /read jira api/i.test(e.label))).toBe(true);
      expect(events.some((e: any) => /read org api/i.test(e.label))).toBe(true);
      expect(result.result.response).toContain(project.key);
      expect(result.result.response).toContain(project.name);
      expect(result.result.response).toContain(orgName);
    } else {
      const decks = result.result.decks || [];
      expect(decks).toHaveLength(1);
      const deck = decks[0];
      expect(deck.attached).toBe(false);
      const got = await callResolver<any>(frame, GLOBAL_APP, 'getDeckContent', {handle:deck.handle,deckId:deck.handle});
      expect(got.success).toBe(true);
      const bytes = Buffer.from(got.base64,'base64');
      const archive = zipEntries(bytes);
      expect(slideFileCount(archive.names)).toBe(4);
      expect((readEntryText(bytes,'ppt/presentation.xml').match(/<p:sldId\b/g)||[]).length).toBe(4);
      expect(bytes.length).toBe(deck.sizeBytes);
      writeFileSync(`${folder}/delivery-confidence.pptx`, bytes);
      entry.deckVerified = {bytes:bytes.length,slides:4};
    }
    await expect(frame.locator('#thinkingIndicator')).toBeHidden({timeout:60000});
    await page.screenshot({path:`${folder}/${scenario.persona}.png`,fullPage:true});
    writeFileSync(`${folder}/result.json`, JSON.stringify(evidence,null,2));
    // Separate the two acceptance turns across Forge's per-minute quota window.
    // Waiting does not send another model request or retry a failed conversation.
    if (scenario.persona === 'jira-admin') await page.waitForTimeout(65000);
  }
});
