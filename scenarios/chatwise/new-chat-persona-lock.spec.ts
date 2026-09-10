import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, awaitSwapSettled } from './chatwise-support';
test('New chat clears the previous turn persona lock without inference', async ({ page }) => {
  const T = getTarget('chatwise-global');
  const frame = await openGlobalPage(page,T);
  await waitForChatApp(page,frame,GLOBAL_APP);
  // Exact client-side state set by lockPersonaOnFirstMessage. No stored row
  // changes and no model request; then drive the user's actual New chat button.
  await frame.locator('body').evaluate(() => {
    const app = (window as any).chatWiseGlobal;
    app.services.persona.setPersonaLocked(true);
    app.components.personaSelector.setPersonaLocked(true);
  });
  await frame.locator('#newChatButton').click();
  await awaitSwapSettled(frame);
  const state = await frame.locator('body').evaluate(() => {
    const app = (window as any).chatWiseGlobal;
    return {serviceLocked:app.services.persona.personaLocked,selectorLocked:app.components.personaSelector.personaLocked};
  });
  console.log(JSON.stringify(state));
  expect(state).toEqual({serviceLocked:false,selectorLocked:false});
  await frame.locator('#dropdownSelected').click();
  await expect(frame.locator('.dropdown-option[data-persona-id="product-owner"]')).toBeVisible();
  await frame.locator('#dropdownSelected').click();
});
