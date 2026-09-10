import { test, expect } from '@playwright/test';
import { buildStub, darkVariant, Surface } from './_stub/build';
let pages: Record<Surface, string>;
test.beforeAll(() => { pages = buildStub(); });
for (const surface of ['globalPage', 'issuePanel'] as Surface[]) {
  for (const dark of [false, true]) {
    test(`${surface} ${dark ? 'dark' : 'light'} shows real tool progress`, async ({ page }) => {
      await page.goto(dark ? darkVariant(pages[surface]) : pages[surface]);
      await page.evaluate(() => {
        const CW = (window as any).CW;
        const chat = new CW.ChatInterface();
        let callbacks: any;
        const handler = new CW.JobMonitoringHandler({
          persona: { getSelectedPersonaId: () => 'jira-admin' },
          jobMonitor: { monitor: (_: any, cb: any) => { callbacks = cb; } },
          chatHandler: { handleJobCompleted: async () => {}, handleJobFailed() {} },
        }, { chat }, { setState() {} });
        handler.monitorJob('stub', { stateKey: 'isSending' });
        callbacks.onStatusUpdate('Reviewing tool results', [
          { id: 1, label: 'Searching the web' },
          { id: 2, label: 'Web search completed' },
        ]);
        (window as any).progressCallbacks = callbacks;
      });
      await expect(page.locator('#thinkingIndicator')).toBeVisible();
      await expect(page.locator('.thinking-text')).toHaveText('Working');
      const borders = await page.locator('.message-bubble').evaluate(el => { const css = getComputedStyle(el); return [css.borderLeftWidth, css.borderRightWidth]; });
      expect(borders[0]).toBe(borders[1]);
      await expect(page.locator('.thinking-status')).toHaveText('Reviewing tool results');
      await expect(page.locator('.message-bubble')).toContainText('Web search completed');
      await page.waitForTimeout(2800);
      await expect(page.locator('.thinking-status')).toHaveText('Reviewing tool results');
      await page.screenshot({ path: `/tmp/cw-progress-${surface}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
      await page.evaluate(async () => { await (window as any).progressCallbacks.onComplete({ response: 'Done' }); });
      await expect(page.locator('#thinkingIndicator')).toBeHidden();
      await expect(page.locator('.message-bubble')).toHaveCount(0);
    });
  }
}
