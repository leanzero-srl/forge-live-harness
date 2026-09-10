import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { enterForgeSurface } from '../../forge/frame';
import { GLOBAL_APP, waitForChatApp, callResolver } from './chatwise-support';
import { cardState, loadCredentialCopy } from './admin-credentials-support';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page, FrameLocator } from '@playwright/test';
const T = getTarget('chatwise-global');
const A = getTarget('chatwise-admin');
test('read-only startup and configured capability baseline', async ({ page }) => {
  test.setTimeout(420000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const results: any = { measuredAt: new Date().toISOString(), stage: process.env.CW_STARTUP_STAGE || 'baseline', startup: [] };
  const folder = '/tmp/cw-startup-evidence';
  mkdirSync(folder, { recursive: true });
  const save = () => writeFileSync(`${folder}/${results.stage}.json`, JSON.stringify(results, null, 2));
  try {
    for (let i = 0; i < 3; i++) {
      await page.goto('/jira/your-work', { waitUntil: 'domcontentloaded' });
      const apps = page.getByRole('button', { name: /^Apps$/i }).first();
      let started = Date.now();
      let entry = 'direct module navigation';
      if (await apps.waitFor({state:"visible",timeout:10000}).then(() => true).catch(() => false)) {
        if (await apps.getAttribute("aria-expanded") !== "true") await apps.click();
        const link = page.getByRole('link', { name: /^ChatWise AI Assistant$/i }).first();
        if (await link.waitFor({state:"visible",timeout:5000}).then(() => true).catch(() => false)) {
          started = Date.now();
          entry = 'Apps > ChatWise';
          await link.click();
        } else {
          started = Date.now();
          await page.goto(T.deepLink(T.envId)!, { waitUntil: 'domcontentloaded' });
        }
      } else {
        await page.goto(T.deepLink(T.envId)!, { waitUntil: 'domcontentloaded' });
      }
      const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
      if (surface.kind !== 'custom') throw new Error('No chat iframe');
      const shellMs = Date.now() - started;
      await waitForChatApp(page, surface.frame, GLOBAL_APP);
      await expect(surface.frame.locator('#loadingOverlay')).toBeHidden();
      await expect(surface.frame.locator('#sendButton')).toBeEnabled();
      const readyMs = Date.now() - started;
      const state = await surface.frame.locator('body').evaluate(() => {
        const app = (window as any).chatWiseGlobal;
        return {
          version: document.body.innerText.match(/v\d+\.\d+\.\d+/)?.[0],
          personas: app.services.persona.personas.map((p: any) => ({ id: p.id, name: p.name, available: p.available })),
        };
      });
      results.startup.push({ run: i + 1, entry, shellMs, readyMs, ...state });
      save();
      if (i === 2) {
        const policy = await callResolver<any>(surface.frame, GLOBAL_APP, 'getToolPolicy');
        results.policy = { success: policy.success, switches: Object.fromEntries(Object.entries(policy.policy || {}).filter(([, value]) => typeof value === 'boolean')) };
      }
    }
    const adminStart = Date.now();
    await page.goto(A.deepLink(A.envId)!, { waitUntil: 'domcontentloaded' });
    let root: Page | FrameLocator = page;
    const deadline = Date.now() + 60000;
    for (;;) {
      const candidates: (Page | FrameLocator)[] = [page];
      for (let i=0; i<await page.locator('iframe').count(); i++) candidates.push(page.locator('iframe').nth(i).contentFrame());
      const found = [];
      for (const candidate of candidates) if (await candidate.getByRole('tab', {name:'Settings',exact:true}).isVisible().catch(() => false)) found.push(candidate);
      if (found.length) { root = found[0]; break; }
      if (Date.now() > deadline) throw new Error('Settings tabs never became visible');
      await page.waitForTimeout(400);
    }
    const tabsMs = Date.now() - adminStart;
    await root.getByRole('tab', {name:'Settings',exact:true}).click();
    const copy: any = await loadCredentialCopy();
    await root.getByText(copy.SITE_TOKEN_CARD.heading, {exact:true}).first().waitFor();
    await root.getByText(copy.ORG_KEY_CARD.heading, {exact:true}).first().waitFor();
    results.settings = { tabsMs, cardsMs: Date.now() - adminStart,
      siteToken: await cardState(root, copy.SITE_TOKEN_CARD), orgKey: await cardState(root, copy.ORG_KEY_CARD) };
    save();
    console.log(JSON.stringify(results));
  } finally { save(); }
});
