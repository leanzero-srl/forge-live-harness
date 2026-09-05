// Identity and source integrity guard for the resumable campaign runner. It has
// no writes; it refuses unowned drafts/fixtures rather than clearing them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect } from '../../fixtures/forge';
import { openPlans, scheduleFields, LZPT_PLAN } from './forecast-fixture';
import { getTestState } from '../../testhook/client';

test.describe.configure({ retries: 0, timeout: 180_000 });
test('campaign: actual UI version and preserved LZPT source', async ({ page }) => {
  const dir = process.env.LZ_CAMPAIGN_UNIT_DIR;
  test.skip(!dir, 'Explicit campaign identity guard; run through scripts/lz-campaign.py');
  const expected = process.env.LZ_EXPECTED_UI_VERSION;
  const phase = process.env.LZ_CAMPAIGN_PHASE;
  expect(expected, 'a concrete deployed UI version is required').toMatch(/^\d+\.\d+\.\d+$/);
  expect(['before', 'after']).toContain(phase);
  const frame = await openPlans(page);
  const body = await frame.locator('body').innerText();
  const actual = body.match(/REV\s+V(\d+\.\d+\.\d+)/i)?.[1];
  expect(actual, 'read the actual revision from the rendered app').toBe(expected);
  const card = frame.locator('.lz-card', { hasText: 'LZPT Scenarios' }).first();
  const text = await card.innerText();
  expect(text).toMatch(/45\s*ISSUES/i);
  expect(text).toMatch(/0\s*DRAFTS/i);
  const detail = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  expect(detail.issues.length, 'the same protected bed is positively visible').toBe(45);
  expect(detail.meta.issueCount).toBe(45);
  expect(detail.meta.protectionEnabled).toBe(false);
  expect(new Set(detail.issues.map((i: any) => i.key)).size).toBe(45);
  for (const key of ['LZPT-209', 'LZPT-212', 'LZPT-214', 'LZPT-215']) expect(detail.issues.some((i: any) => i.key === key)).toBe(true);
  const source = { issues: scheduleFields(detail.issues), sources: detail.meta.sources, calendarKey: detail.meta.calendarKey,
    holidayYears: detail.meta.holidayYears, milestones: detail.meta.milestones, protectionEnabled: detail.meta.protectionEnabled };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const plans = (await getTestState('lz-ppm', { what: 'plans' })).plans;
  const planIds = plans.map((p: any) => p.id).sort();
  const identity = { time: new Date().toISOString(), phase, uiVersion: actual, sourceFingerprint: fingerprint, issueCount: detail.issues.length, drafts: 0, protectionEnabled: false, planIds };
  if (phase === 'after') {
    const before = JSON.parse(fs.readFileSync(path.join(dir!, 'before-identity.json'), 'utf8'));
    expect(fingerprint, 'the complete source schedule and plan settings are unchanged').toBe(before.sourceFingerprint);
    expect(planIds, 'no temporary plan remains or original plan disappeared').toEqual(before.planIds);
  }
  fs.mkdirSync(dir!, { recursive: true });
  fs.writeFileSync(path.join(dir!, `${phase}-identity.json`), JSON.stringify(identity, null, 2) + '\n');
  await page.screenshot({ path: path.join(dir!, `${phase}-identity.png`), fullPage: true, animations: 'disabled' });
  console.log('CAMPAIGN_IDENTITY', JSON.stringify(identity));
});
