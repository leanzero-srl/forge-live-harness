// DEEP global-admin persistence round-trip (COVERAGE-MATRIX worklist #4 — replaces the soft-assert
// steward-console-deep). Flip the default seal duration + the allowArtifactDelete gating toggle on the
// steward global-settings surface → Apply → HARD-assert the it16 resolver-success banner (not a false
// "updated") → assert the values round-tripped through store-policy(global) → admin-settings-global →
// reload → the duration persists in the UI. PRESERVES + restores the ORIGINAL global policy exactly
// (the whole install reads it). Dev-scoped.
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("sentinel-steward-console");
const GLOBAL = "admin-settings-global";
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
async function openSteward(page: any) {
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected Custom UI");
  const app = s.frame;
  await expect(app.locator(".admin-title")).toBeVisible({ timeout: 15000 });
  return app;
}
test.describe.configure({ retries: 2 });

test("global admin settings round-trip: change duration + gating toggle → Apply (it16 success) → persist", async ({ page }) => {
  const original = await getKvs(GLOBAL);
  let hrs = "47", expectDelete = false;
  try {
    const app = await openSteward(page);
    const dur = app.locator(".settings-row", { hasText: "Default Seal Duration" }).locator('input[type="number"]');
    await expect(dur).toBeVisible({ timeout: 10000 });
    hrs = (await dur.inputValue()).trim() === "47" ? "71" : "47"; // flip → guarantees a real change
    await dur.fill(hrs);
    const delToggle = app.locator(".settings-row", { hasText: "Allow Attachment Removal" }).locator(".form-checkbox");
    expectDelete = !(await delToggle.locator('input[type="checkbox"]').isChecked());
    await delToggle.click();
    await app.getByRole("button", { name: /Apply Configuration/i }).click();
    // it16: the resolver-success banner must appear (not a blind "updated" on an authz denial)
    await expect(app.locator(".alert-success")).toBeVisible({ timeout: 15000 });
    console.log("### saved: hrs=", hrs, "allowArtifactDelete=", expectDelete);
    // store-policy(global) round-trip → the durable KVS reflects BOTH the duration + the gating toggle
    await expect.poll(async () => {
      const g = await getKvs(GLOBAL);
      return g?.defaultLockDuration === parseInt(hrs, 10) * 3600 && g?.allowArtifactDelete === expectDelete;
    }, { timeout: 15000, message: "store-policy(global) persisted duration + gating toggle" }).toBe(true);
    console.log("### admin-settings-global round-trip ✓");
    // reload → the duration persists in the UI (fresh load re-reads via load-policy)
    const app2 = await openSteward(page);
    const dur2 = app2.locator(".settings-row", { hasText: "Default Seal Duration" }).locator('input[type="number"]');
    await expect(dur2).toBeVisible({ timeout: 10000 });
    expect((await dur2.inputValue()).trim(), "duration persisted in UI after reload").toBe(hrs);
    console.log("### persisted in UI after reload ✓");
  } finally {
    if (original) await setKvs(GLOBAL, original); else await delKvs(GLOBAL);
  }
});
