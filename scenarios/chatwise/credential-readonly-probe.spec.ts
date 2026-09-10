import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { openAdminSettings, loadCredentialCopy, cardState, assertCardButton } from './admin-credentials-support';
import { writeFileSync } from 'node:fs';

test('configured administrator credentials pass their read-only Atlassian probes', async ({ page }) => {
  test.setTimeout(150000);
  test.info().annotations.push({type:'cost',description:'No inference; existing configured credential Test buttons only'});
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const target = getTarget('chatwise-admin');
  const root = await openAdminSettings(page,target.deepLink(target.envId)!);
  expect(new URL(page.url()).hostname).toBe('wolfaenpak.atlassian.net');
  const copy = await loadCredentialCopy();
  const evidence: any = {measuredAt:new Date().toISOString(),credentials:[]};
  for (const card of [copy.SITE_TOKEN_CARD,copy.ORG_KEY_CARD]) {
    await root.getByText(card.heading,{exact:true}).first().waitFor({timeout:30000});
    const before = await cardState(root,card);
    expect(before).toBe('configured');
    await (await assertCardButton(root,card.heading,card.buttons.test)).click();
    await expect(root.getByText(card.testPass,{exact:true}).first()).toBeVisible({timeout:60000});
    const sentence = await root.getByText(/^Atlassian accepted it\./).allTextContents();
    evidence.credentials.push({heading:card.heading,before,after:await cardState(root,card),accepted:true,sentences:sentence});
    writeFileSync('/tmp/cw-credential-readonly-probe.json',JSON.stringify(evidence,null,2));
  }
  console.log(JSON.stringify(evidence));
});
