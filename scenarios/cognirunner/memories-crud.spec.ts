// LIVE BROWSER — admin Memories tab CRUD (journey J11). Drives the REAL admin panel (Forge globalPage
// iframe): add a memory → assert it lists → delete it (custom confirm dialog) → assert it's gone; then
// toggle the autoCapture setting and verify it PERSISTED by reading COGNIRUNNER_MEMORY_SETTINGS via the
// dev test-hook (the oracle). Asserts real persistence, not just that buttons exist.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
test.describe.configure({ retries: 2 });

async function memorySettings(): Promise<any> {
  const r = await fetch(`${HOOK}?what=kvs&key=COGNIRUNNER_MEMORY_SETTINGS`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`hook kvs read ${r.status}`);
  return (await r.json()).value;
}

test("J11 admin Memories — add → list → delete + autoCapture toggle persists", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });
  const marker = `rulelab CRUD probe ${Date.now().toString(36)}`;

  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });

  await recorder.step("go to Memories tab", async () => {
    await frame.locator(".tab-btn", { hasText: /^\s*Memories\s*$/ }).first().click();
    await expect(frame.locator("input[placeholder*='Remember this']")).toBeVisible({ timeout: 15_000 });
  });

  await recorder.step("add a memory", async () => {
    await frame.locator("input[placeholder*='Remember this']").fill(marker);
    await frame.locator("button.btn-add-memory", { hasText: /Add Memory/i }).click();
    // the new memory row should appear with the marker text
    await expect(frame.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  }, { expectation: { assertion: "the added memory appears in the list", narrative: "A user-added memory shows in the admin list immediately." } });

  await recorder.step("delete the memory (custom confirm dialog)", async () => {
    // find the row containing the marker, click its Delete, confirm in the .cr-confirm-overlay
    const row = frame.locator("tr", { hasText: marker }).first();
    await row.locator("button.btn-danger", { hasText: /Delete/i }).click();
    const overlay = frame.locator(".cr-confirm-overlay");
    await expect(overlay).toBeVisible({ timeout: 8000 });
    await overlay.locator("button.btn-danger", { hasText: /Delete/i }).click();
    await expect(frame.getByText(marker, { exact: false })).toHaveCount(0, { timeout: 20_000 });
  }, { expectation: { assertion: "the memory is removed after confirming", narrative: "Deleting via the custom confirm dialog removes the memory from the list." } });

  await recorder.step("autoCapture toggle PERSISTS (verified via the KVS hook)", async () => {
    const before = (await memorySettings())?.autoCapture === true;
    const toggle = frame.locator("#mem-auto-capture");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();
    // poll the persisted setting until it flips (settings save is a resolver round-trip)
    let flipped = false;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1500);
      if (((await memorySettings())?.autoCapture === true) !== before) { flipped = true; break; }
    }
    expect(flipped, `autoCapture persisted a flip (${before} → ${!before})`).toBe(true);
    // revert so the instance ends as it began
    await toggle.click();
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1500);
      if (((await memorySettings())?.autoCapture === true) === before) break;
    }
  }, { expectation: { assertion: "toggling autoCapture writes through to COGNIRUNNER_MEMORY_SETTINGS", narrative: "The autoCapture toggle persists to KVS (verified via the hook)." } });
});
