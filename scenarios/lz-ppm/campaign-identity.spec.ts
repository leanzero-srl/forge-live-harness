// Identity and source integrity guard for the resumable campaign runner. It has
// no writes; it refuses unowned drafts/fixtures rather than clearing them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import { test, expect } from '../../fixtures/forge';
import { openPlans, scheduleFields, LZPT_PLAN } from './forecast-fixture';
import { getTestState } from '../../testhook/client';
import {retainedIdentityPolicy,retainedPlanNames} from './retained-identity-policy.mjs';
import {actualResponse,currentUserResolver} from './campaign-ui';

test.describe.configure({ retries: 0, timeout: 180_000 });
test('campaign: actual UI version and preserved LZPT source', async ({ page }) => {
  const dir = process.env.LZ_CAMPAIGN_UNIT_DIR;
  test.skip(!dir, 'Explicit campaign identity guard; run through scripts/lz-campaign.py');
  const expected = process.env.LZ_EXPECTED_UI_VERSION;
  const phase = process.env.LZ_CAMPAIGN_PHASE;
  const extension = JSON.parse(process.env.LZ_CAMPAIGN_SOURCE_EXTENSION || 'null');
  const foreignKeys: string[] = extension?.keys || [];
  expect(new Set(foreignKeys).size).toBe(foreignKeys.length);
  if (extension) { expect(extension.reason).toBeTruthy(); expect(extension.originalFingerprint).toMatch(/^[a-f0-9]{64}$/); }
  const expectedCount = 45 + foreignKeys.length;
  expect(expected, 'a concrete deployed UI version is required').toMatch(/^\d+\.\d+\.\d+$/);
  expect(['before', 'after']).toContain(phase);
  const frame = await openPlans(page);
  const body = await frame.locator('body').innerText();
  const actual = body.match(/REV\s+V(\d+\.\d+\.\d+)/i)?.[1];
  expect(actual, 'read the actual revision from the rendered app').toBe(expected);
  const card = frame.locator('.lz-card', { hasText: 'LZPT Scenarios' }).first();
  await expect(card).toContainText(new RegExp(`${expectedCount}\\s*ISSUES`, 'i'));
  await expect(card).toContainText(/0\s*DRAFTS/i);
  const detail = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  expect(detail.issues.length, 'the same protected bed is positively visible').toBe(expectedCount);
  expect(detail.meta.issueCount).toBe(expectedCount);
  expect(detail.meta.protectionEnabled).toBe(false);
  expect(new Set(detail.issues.map((i: any) => i.key)).size).toBe(expectedCount);
  for (const key of ['LZPT-209', 'LZPT-212', 'LZPT-214', 'LZPT-215']) expect(detail.issues.some((i: any) => i.key === key)).toBe(true);
  const source = { issues: scheduleFields(detail.issues), sources: detail.meta.sources, calendarKey: detail.meta.calendarKey,
    holidayYears: detail.meta.holidayYears, milestones: detail.meta.milestones, protectionEnabled: detail.meta.protectionEnabled };
  const ORIGINAL_FINGERPRINT='2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104';
  {
    const originalKeys = Array.from({length:45},(_,n)=>`LZPT-${186+n}`);
    expect(detail.issues.map((i:any)=>i.key).sort()).toEqual([...originalKeys,...foreignKeys].sort());
    const original = {...source, issues: source.issues.filter((i:any)=>originalKeys.includes(i.key))};
    expect(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'), 'original 45 complete source schedule remains unchanged').toBe(ORIGINAL_FINGERPRINT);
    if(extension)expect(extension.originalFingerprint).toBe(ORIGINAL_FINGERPRINT);
  }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const plans = (await getTestState('lz-ppm', { what: 'plans' })).plans;
  const planIds = plans.map((p: any) => p.id).sort();
  const identity:any = { time: new Date().toISOString(), phase, uiVersion: actual, sourceFingerprint: fingerprint, issueCount: detail.issues.length, coordinatedSourceExtension: extension, drafts: 0, protectionEnabled: false, planIds };
  if (phase === 'after') {
    const before = JSON.parse(fs.readFileSync(path.join(dir!, 'before-identity.json'), 'utf8'));
    expect(fingerprint, 'the complete source schedule and plan settings are unchanged').toBe(before.sourceFingerprint);
    const ledgerPath=process.env.LZ_RETAINED_UAT_LEDGER;
    if(!ledgerPath)expect(planIds, 'no temporary plan remains or original plan disappeared').toEqual(before.planIds);
    else{
      expect(path.resolve(ledgerPath)).toBe(path.join(path.resolve(dir!),'retained-uat-ledger.json'));
      expect(fs.lstatSync(ledgerPath).isSymbolicLink()).toBe(false);const ledgerBytes=fs.readFileSync(ledgerPath),ledger=JSON.parse(ledgerBytes.toString('utf8'));
      const globalLedger=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../scratch/lz-retained-uat-20260906/ownership.json');
      expect(ledger.ledgerPath).toBe(globalLedger);expect(fs.realpathSync(globalLedger)).toBe(globalLedger);expect(fs.readFileSync(globalLedger).equals(ledgerBytes),'attempt mirror matches the fixed exclusive ownership claim').toBe(true);
      const retained=Object.values(retainedPlanNames).map(name=>{const found=plans.filter((p:any)=>p.name===name);expect(found).toHaveLength(1);return found[0];});
      for(const p of retained)await expect(frame.locator('.lz-card',{hasText:p.name})).toContainText(/0\s*DRAFTS/i);
      const details=await Promise.all(retained.map(p=>getTestState('lz-ppm',{what:'plan',planId:p.id})));
      const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');
      try{
        const settingsResponse=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const saved=await settingsResponse;
        const actualDrafts=[];for(const p of retained){const draft=await rpc.invoke('getDraft',{planId:p.id}),active=await rpc.invoke('getActiveDrafts',{planId:p.id});expect(draft.success).toBe(true);expect(active.success).toBe(true);actualDrafts.push({planId:p.id,draft:draft.draft,drafts:active.drafts});}
        identity.retention=retainedIdentityPolicy({ledger,beforeBytes:fs.readFileSync(path.join(dir!,'before-identity.json')),runId:process.env.LZ_CAMPAIGN_RUN_ID,unitDir:dir,ledgerPath,actualLedgerPath:fs.realpathSync(ledgerPath),plans,details,actualCapacitySettings:saved.settings,actualDrafts});
      }finally{rpc.stop();}
      await openPlans(page);
    }
  }
  fs.mkdirSync(dir!, { recursive: true });
  fs.writeFileSync(path.join(dir!, `${phase}-identity.json`), JSON.stringify(identity, null, 2) + '\n');
  await page.screenshot({ path: path.join(dir!, `${phase}-identity.png`), fullPage: true, animations: 'disabled' });
  console.log('CAMPAIGN_IDENTITY', JSON.stringify(identity));
});
