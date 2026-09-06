# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-identity.spec.ts >> campaign: actual UI version and preserved LZPT source
- Location: scenarios/lz-ppm/campaign-identity.spec.ts:11:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('.lz-card').filter({ hasText: 'LZPT Scenarios' }).first()
Expected pattern: /45\s*ISSUES/i
Received string:  "LZPT ScenariosReady51Issues1Sources0DraftsJQL?Updated 1m agoIndexed 1m agoOpen plan →"
Timeout: 15000ms

Call log:
  - Expect "toContainText" with timeout 15000ms
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('.lz-card').filter({ hasText: 'LZPT Scenarios' }).first()
    5 × locator resolved to <div class="lz-card lz-card--interactive animate-slide-up">…</div>
      - unexpected value "LZPT ScenariosReady51Issues1Sources0DraftsJQL?Updated 1m agoIndexed 1m agoOpen plan →"
    29 × locator resolved to <div class="lz-card lz-card--interactive">…</div>
       - unexpected value "LZPT ScenariosReady51Issues1Sources0DraftsJQL?Updated 1m agoIndexed 1m agoOpen plan →"

```

```yaml
- heading "LZPT Scenarios" [level=3]
- text: Ready
- button "More":
  - img
- text: 51 Issues 1 Sources 0 Drafts JQL ? Updated 1m ago Indexed 1m ago
- button "Open plan →"
```

# Test source

```ts
  1  | // Identity and source integrity guard for the resumable campaign runner. It has
  2  | // no writes; it refuses unowned drafts/fixtures rather than clearing them.
  3  | import fs from 'node:fs';
  4  | import path from 'node:path';
  5  | import crypto from 'node:crypto';
  6  | import { test, expect } from '../../fixtures/forge';
  7  | import { openPlans, scheduleFields, LZPT_PLAN } from './forecast-fixture';
  8  | import { getTestState } from '../../testhook/client';
  9  | 
  10 | test.describe.configure({ retries: 0, timeout: 180_000 });
  11 | test('campaign: actual UI version and preserved LZPT source', async ({ page }) => {
  12 |   const dir = process.env.LZ_CAMPAIGN_UNIT_DIR;
  13 |   test.skip(!dir, 'Explicit campaign identity guard; run through scripts/lz-campaign.py');
  14 |   const expected = process.env.LZ_EXPECTED_UI_VERSION;
  15 |   const phase = process.env.LZ_CAMPAIGN_PHASE;
  16 |   expect(expected, 'a concrete deployed UI version is required').toMatch(/^\d+\.\d+\.\d+$/);
  17 |   expect(['before', 'after']).toContain(phase);
  18 |   const frame = await openPlans(page);
  19 |   const body = await frame.locator('body').innerText();
  20 |   const actual = body.match(/REV\s+V(\d+\.\d+\.\d+)/i)?.[1];
  21 |   expect(actual, 'read the actual revision from the rendered app').toBe(expected);
  22 |   const card = frame.locator('.lz-card', { hasText: 'LZPT Scenarios' }).first();
> 23 |   await expect(card).toContainText(/45\s*ISSUES/i);
     |                      ^ Error: expect(locator).toContainText(expected) failed
  24 |   await expect(card).toContainText(/0\s*DRAFTS/i);
  25 |   const detail = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  26 |   expect(detail.issues.length, 'the same protected bed is positively visible').toBe(45);
  27 |   expect(detail.meta.issueCount).toBe(45);
  28 |   expect(detail.meta.protectionEnabled).toBe(false);
  29 |   expect(new Set(detail.issues.map((i: any) => i.key)).size).toBe(45);
  30 |   for (const key of ['LZPT-209', 'LZPT-212', 'LZPT-214', 'LZPT-215']) expect(detail.issues.some((i: any) => i.key === key)).toBe(true);
  31 |   const source = { issues: scheduleFields(detail.issues), sources: detail.meta.sources, calendarKey: detail.meta.calendarKey,
  32 |     holidayYears: detail.meta.holidayYears, milestones: detail.meta.milestones, protectionEnabled: detail.meta.protectionEnabled };
  33 |   const fingerprint = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
  34 |   const plans = (await getTestState('lz-ppm', { what: 'plans' })).plans;
  35 |   const planIds = plans.map((p: any) => p.id).sort();
  36 |   const identity = { time: new Date().toISOString(), phase, uiVersion: actual, sourceFingerprint: fingerprint, issueCount: detail.issues.length, drafts: 0, protectionEnabled: false, planIds };
  37 |   if (phase === 'after') {
  38 |     const before = JSON.parse(fs.readFileSync(path.join(dir!, 'before-identity.json'), 'utf8'));
  39 |     expect(fingerprint, 'the complete source schedule and plan settings are unchanged').toBe(before.sourceFingerprint);
  40 |     expect(planIds, 'no temporary plan remains or original plan disappeared').toEqual(before.planIds);
  41 |   }
  42 |   fs.mkdirSync(dir!, { recursive: true });
  43 |   fs.writeFileSync(path.join(dir!, `${phase}-identity.json`), JSON.stringify(identity, null, 2) + '\n');
  44 |   await page.screenshot({ path: path.join(dir!, `${phase}-identity.png`), fullPage: true, animations: 'disabled' });
  45 |   console.log('CAMPAIGN_IDENTITY', JSON.stringify(identity));
  46 | });
  47 | 
```