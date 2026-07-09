// DEEP admin PERSISTENCE journey: change the space's custom seal (reservation) duration on the
// realm-console, Save, and assert it round-trips through store-policy → KVS → reload. The render
// smokes only prove a tab shows up; this proves a WRITE actually persists (guards silent-save-fail
// and reload-staleness). Flips between two distinct values each run so a real change is exercised
// every time. Dev-scoped via the .space-admin-title readySelector (prod v2 uses the old title).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { BASE_URL } from "../../config/env";

const T = getTarget("sentinel-vault-realm");
test.describe.configure({ retries: 2 });

async function openReservationTab(page: any) {
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected a Custom UI iframe");
  const app = s.frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
  await app.locator(".tab-navigation .tab-button", { hasText: "Reservation Duration" }).click();
  await page.waitForTimeout(900);
  return app;
}

test("space seal-duration change persists across a reload (store-policy round-trip)", async ({ page, recorder }) => {
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + T.deepLink(T.envId), repo: T.repo,
  });

  let next = "73";
  await recorder.step("set a distinct custom seal duration + Apply", async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const app = await openReservationTab(page);
    // Reveal the custom-duration input by un-checking "Use System Default" if needed.
    const customInput = app.locator('.input-with-unit input[type="number"]');
    if (!(await customInput.isVisible().catch(() => false))) {
      await app.locator(".settings-row", { hasText: "System Default" }).locator(".form-checkbox").click();
      await page.waitForTimeout(500);
    }
    await expect(customInput).toBeVisible({ timeout: 8000 });
    const cur = (await customInput.inputValue()).trim();
    next = cur === "73" ? "96" : "73"; // flip → guarantees a real change every run
    await customInput.fill(next);
    await app.locator(".action-bar .btn-primary").click();
    // The save MUST report success — not a silent no-op or an authz denial reported as done.
    await expect(app.getByText("Space preferences updated", { exact: false })).toBeVisible({ timeout: 15000 });
    console.log("### saved reservation hours =", next);
  }, { expectation: { assertion: "the custom seal duration saves with a success confirmation", narrative: "Changes the space seal duration and Applies; asserts the success banner." } });

  await recorder.step("reload → the new duration persisted", async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const app = await openReservationTab(page);
    const customInput = app.locator('.input-with-unit input[type="number"]');
    await expect(customInput).toBeVisible({ timeout: 8000 });
    const persisted = (await customInput.inputValue()).trim();
    console.log("### persisted after reload =", persisted);
    expect(persisted, `reservation duration should persist as ${next} after reload`).toBe(next);
  }, { expectation: { assertion: "the saved seal duration survives a full page reload", narrative: "Reloads the console and asserts the seal duration equals what was saved." } });
});
