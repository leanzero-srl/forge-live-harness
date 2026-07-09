// DEEP admin CRUD journey: add a validation rule on the realm-console Validations tab, Save,
// reload → assert it persisted; then delete it, Save, reload → assert it's gone. Proves the
// store-validation-config write/delete round-trips through KVS (not just that the editor renders).
// Self-cleaning (removes ALL copies of the test label) so it never accumulates test rules, even
// after a failed prior run. Dev-scoped via the .space-admin-title readySelector.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { BASE_URL } from "../../config/env";

const T = getTarget("sentinel-vault-realm");
const LABEL = "AQL-persist-check";
test.describe.configure({ retries: 2 });

async function openValidations(page: any) {
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected a Custom UI iframe");
  const app = s.frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
  await app.locator(".tab-navigation .tab-button", { hasText: "Validations" }).click();
  await page.waitForTimeout(1000);
  await expect(app.locator(".val-rules")).toBeVisible({ timeout: 10000 });
  return app;
}
async function countLabelled(app: any) {
  const labels = app.locator('.val-rule-card input[placeholder^="Label"]');
  const c = await labels.count();
  let hits = 0;
  for (let i = 0; i < c; i++) if ((await labels.nth(i).inputValue()).trim() === LABEL) hits++;
  return hits;
}
async function removeAllLabelled(app: any, page: any) {
  // indices shift as cards are removed → re-query each pass until none remain
  for (let guard = 0; guard < 20; guard++) {
    const labels = app.locator('.val-rule-card input[placeholder^="Label"]');
    const c = await labels.count();
    let idx = -1;
    for (let i = 0; i < c; i++) if ((await labels.nth(i).inputValue()).trim() === LABEL) { idx = i; break; }
    if (idx < 0) break;
    await app.locator(".val-rule-card").nth(idx).locator(".val-rule-remove").click();
    await page.waitForTimeout(250);
  }
}

test("validation rule add → save → reload persists → delete → reload gone (CRUD round-trip)", async ({ page, recorder }) => {
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + T.deepLink(T.envId), repo: T.repo,
  });

  await recorder.step("add a labelled rule + Save", async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const app = await openValidations(page);
    await removeAllLabelled(app, page); // defensively clear any stale copy from a failed run
    await app.getByRole("button", { name: "+ Add rule" }).click();
    await page.waitForTimeout(300);
    // the just-added card is the last one; set its label
    const cards = app.locator(".val-rule-card");
    await cards.last().locator('input[placeholder^="Label"]').fill(LABEL);
    await app.locator(".action-bar .btn-primary").click();
    await expect(app.locator(".alert-success")).toBeVisible({ timeout: 15000 });
    console.log("### added + saved rule:", LABEL);
  }, { expectation: { assertion: "a new validation rule saves with a success confirmation", narrative: "Adds a labelled rule and Saves; asserts the success alert." } });

  await recorder.step("reload → the rule persisted", async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const app = await openValidations(page);
    const hits = await countLabelled(app);
    console.log("### labelled rules after reload:", hits);
    expect(hits, `rule "${LABEL}" should persist after reload`).toBeGreaterThanOrEqual(1);
  }, { expectation: { assertion: "the added rule survives a full reload", narrative: "Reloads and finds the persisted validation rule." } });

  await recorder.step("delete the rule + Save → reload → gone", async () => {
    const app = await openValidations(page);
    await removeAllLabelled(app, page);
    await app.locator(".action-bar .btn-primary").click();
    await expect(app.locator(".alert-success")).toBeVisible({ timeout: 15000 });
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const app2 = await openValidations(page);
    const hits = await countLabelled(app2);
    console.log("### labelled rules after delete+reload:", hits);
    expect(hits, `rule "${LABEL}" should be gone after delete + reload`).toBe(0);
  }, { expectation: { assertion: "deleting a rule persists (it's gone after reload)", narrative: "Removes the rule, Saves, reloads, and asserts it no longer exists." } });
});
