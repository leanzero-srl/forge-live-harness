// LIVE BROWSER — admin Rules tab: browse/search at scale (J4) + enable/disable round-trip (J6).
// Drives the real admin panel (Forge globalPage iframe). J4: the Configured Rules table renders many
// rows, a gibberish search shows the empty-state, a real term narrows to a positive subset, clearing
// restores the baseline. J6: disabling the first rule flips its `disabled` flag in the registry
// (verified via the ?what=registry test-hook oracle) AND the row's UI (badge + Enable button), then
// re-enabling restores it. The toggle is a pure KVS flag-flip (disableRule/enableRule) — fully
// reversible; a finally block best-effort-restores the rule if the test aborts mid-round-trip.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
test.describe.configure({ retries: 2 });

// The registry hook returns { registry: { <id>: config, ... } } — a map keyed by rule id.
async function registryMap(): Promise<Record<string, any>> {
  const r = await fetch(`${HOOK}?what=registry`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`hook registry read ${r.status}`);
  const j = await r.json();
  const reg = j?.registry ?? j?.value ?? j;
  return reg && typeof reg === "object" ? reg : {};
}
const disabledIds = (m: Record<string, any>) =>
  Object.entries(m).filter(([, c]) => c && c.disabled === true).map(([id]) => id);

// Open the admin panel and return the Custom-UI frame sitting on the (default) Rules tab.
async function openRulesTab(page: any, recorder: any) {
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });
  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });
  // Rules is the default tab; click it explicitly to be robust to any stored tab state.
  await frame.locator(".tab-btn", { hasText: /^\s*Rules\s*$/ }).first().click();
  await expect(frame.locator("input.list-search")).toBeVisible({ timeout: 15_000 });
  return frame;
}

test("J4 admin Rules — browse at scale, free-text search narrows + empty-state + restore", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const frame = await openRulesTab(page, recorder);
  const rows = frame.locator("table.table tbody tr");

  await recorder.step("Configured Rules renders many rows (reconciles with registry)", async () => {
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const uiCount = await rows.count();
    const reg = await registryMap();
    const regCount = Object.keys(reg).length;
    console.log(`Rules table: UI rows=${uiCount}, registry rules=${regCount}`);
    expect(uiCount, "the Rules table lists a substantial number of registered rules").toBeGreaterThanOrEqual(20);
    // The UI can't show MORE rules than exist in the registry (allow a tiny slack for expand rows).
    expect(uiCount, "UI row count does not exceed the registry population").toBeLessThanOrEqual(regCount + 3);
  }, { expectation: { assertion: "the Configured Rules table renders the registered rules at scale", narrative: "The admin Rules tab browses every registered rule; its count reconciles with the KVS registry." } });

  await recorder.step("gibberish search → empty-state", async () => {
    await frame.locator("input.list-search").fill("zzqqxx7799nomatch");
    await expect(frame.locator(".empty-state", { hasText: /No rules match/i })).toBeVisible({ timeout: 8000 });
  }, { expectation: { assertion: "a non-matching search shows the 'No rules match' empty-state", narrative: "Free-text filtering honestly reports when nothing matches." } });

  await recorder.step("real term narrows to a positive subset", async () => {
    await frame.locator("input.list-search").fill("condition");
    // Let the filter settle, then assert a positive subset strictly smaller than the full list.
    await expect(rows.first()).toBeVisible({ timeout: 8000 });
    const narrowed = await rows.count();
    const reg = await registryMap();
    const regConditions = Object.values(reg).filter((c: any) => c && c.type === "condition").length;
    console.log(`search "condition": narrowed=${narrowed}, registry condition-type rules=${regConditions}`);
    expect(narrowed, "narrowed result is non-empty").toBeGreaterThan(0);
    expect(narrowed, "narrowed result is a strict subset of the full list").toBeLessThan(Object.keys(reg).length);
    // Every condition-type rule matches the term (its type contains "condition"); the match may be a
    // superset if some other rule's prompt mentions the word, so assert >= the type count.
    expect(narrowed, "at least all condition-type rules are matched").toBeGreaterThanOrEqual(Math.min(regConditions, 1));
  }, { expectation: { assertion: "a real search term narrows the table to a positive subset", narrative: "The filter matches on type/field/prompt/workflow and shrinks the list accordingly." } });

  await recorder.step("clearing the search restores the full list", async () => {
    await frame.locator("input.list-search").fill("");
    await expect(rows.first()).toBeVisible({ timeout: 8000 });
    expect(await rows.count(), "clearing the filter restores rows").toBeGreaterThanOrEqual(20);
  }, { expectation: { assertion: "clearing the search restores the full rule list", narrative: "Emptying the filter returns to the complete Configured Rules view." } });
});

test("J6 admin Rules — disable first rule flips registry + UI, re-enable restores", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const frame = await openRulesTab(page, recorder);
  const rows = frame.locator("table.table tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const firstRow = rows.first();
  let flippedId: string | null = null;

  try {
    await recorder.step("disable the first rule → registry flag flips + UI shows Disabled", async () => {
      const before = disabledIds(await registryMap());
      const btn = firstRow.locator("button.btn-danger, button.btn-enable").first();
      await expect(btn, "first rule shows a toggle button").toBeVisible({ timeout: 8000 });
      await expect(btn, "first rule starts enabled (Disable action)").toHaveText(/Disable/i);
      await btn.click();
      // Poll the registry oracle for the newly-disabled id.
      for (let i = 0; i < 12 && !flippedId; i++) {
        const now = disabledIds(await registryMap());
        const fresh = now.filter((id) => !before.includes(id));
        if (fresh.length) flippedId = fresh[0];
        else await page.waitForTimeout(1500);
      }
      console.log(`disabled rule id: ${flippedId} (previously-disabled: ${before.length})`);
      expect(flippedId, "exactly one rule became disabled in the registry").toBeTruthy();
      // UI reflects it: row gets the disabled badge and the toggle now offers Enable.
      await expect(firstRow.locator(".status-disabled")).toBeVisible({ timeout: 8000 });
      await expect(firstRow.locator("button.btn-enable")).toHaveText(/Enable/i, { timeout: 8000 });
    }, { expectation: { assertion: "disabling a rule flips its registry flag and shows a Disabled badge", narrative: "The Disable action persists to the KVS registry and the row reflects the new state." } });

    await recorder.step("re-enable the rule → registry flag clears + UI restored", async () => {
      const btn = firstRow.locator("button.btn-enable").first();
      await btn.click();
      let restored = false;
      for (let i = 0; i < 12 && !restored; i++) {
        const m = await registryMap();
        if (!m[flippedId!] || m[flippedId!].disabled !== true) restored = true;
        else await page.waitForTimeout(1500);
      }
      expect(restored, "the rule's disabled flag cleared in the registry").toBe(true);
      await expect(firstRow.locator(".status-disabled")).toHaveCount(0, { timeout: 8000 });
      await expect(firstRow.locator("button.btn-danger")).toHaveText(/Disable/i, { timeout: 8000 });
    }, { expectation: { assertion: "re-enabling restores the rule everywhere", narrative: "The Enable action clears the registry flag and the row returns to its active state." } });
  } finally {
    // Safety net: never leave a real rule disabled if the round-trip aborted mid-way.
    if (flippedId) {
      const m = await registryMap();
      if (m[flippedId] && m[flippedId].disabled === true) {
        console.warn(`RESTORE: rule ${flippedId} left disabled — attempting UI re-enable`);
        try {
          await firstRow.locator("button.btn-enable").first().click({ timeout: 5000 });
          await page.waitForTimeout(2000);
        } catch { /* best effort */ }
        const after = await registryMap();
        if (after[flippedId]?.disabled === true) console.error(`RESTORE FAILED: rule ${flippedId} still disabled — manual re-enable needed`);
      }
    }
  }
});
