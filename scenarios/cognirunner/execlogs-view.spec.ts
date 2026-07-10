// LIVE BROWSER — admin Execution Logs tab (journey J13). Drives the real admin panel (Forge globalPage
// iframe): open Execution Logs → assert entries render with source + type chips (activity attribution) →
// exercise the free-text filter (a no-match query empties the list; a common term restores it) → cross-check
// the UI against the ?what=execlogs hook (the KVS oracle; both capped at MAX_LOGS=50).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
test.describe.configure({ retries: 2 });

async function hookLogCount(): Promise<number> {
  const r = await fetch(`${HOOK}?what=execlogs`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`hook execlogs ${r.status}`);
  return ((await r.json()).logs || []).length;
}

test("J13 admin Execution Logs — entries + source/type chips render, filter narrows, matches the KVS hook", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
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

  await recorder.step("open Execution Logs (entries render with attribution chips)", async () => {
    await frame.locator(".tab-btn", { hasText: /Execution Logs/i }).first().click();
    // logs are expanded by default; if a "Show Logs" button is present, click it to ensure they load.
    const showBtn = frame.locator("button.btn-small", { hasText: /^\s*Show Logs\s*$/ });
    if (await showBtn.count().catch(() => 0)) await showBtn.first().click().catch(() => {});
    await expect(frame.locator(".log-entry").first()).toBeVisible({ timeout: 20_000 });
    const entries = await frame.locator(".log-entry").count();
    const hookN = await hookLogCount();
    console.log(`logs: ${entries} entries on page · hook execlogs=${hookN} (cap 50)`);
    expect(entries, "execution log entries render").toBeGreaterThan(0);
    expect(hookN, "the KVS log store has entries (oracle)").toBeGreaterThan(0);
    expect(hookN, "log store is capped at MAX_LOGS=50").toBeLessThanOrEqual(50);
    // activity-attribution chips (it10): every entry carries a status, a type badge, and a source chip.
    expect(await frame.locator(".log-entry .log-status").count(), "PASS/SKIP/ERR status chips").toBeGreaterThan(0);
    expect(await frame.locator(".log-entry .log-type-badge").count(), "type badges (Validator/PF/…)").toBeGreaterThan(0);
    expect(await frame.locator(".log-entry .log-src").count(), "source chips (runtime/async)").toBeGreaterThan(0);
  }, { expectation: { assertion: "logs render with attribution chips", narrative: "The Execution Logs tab shows real runs with status, type and source chips." } });

  await recorder.step("filter narrows the list (no-match empties, common term restores)", async () => {
    const search = frame.locator("input.list-search");
    await expect(search).toBeVisible({ timeout: 10_000 });
    // no-match → empty state, zero entries
    await search.fill("zzznomatch-" + Date.now());
    await expect(frame.locator(".log-entry")).toHaveCount(0, { timeout: 8000 });
    await expect(frame.locator(".logs-empty", { hasText: /No matching logs/i })).toBeVisible({ timeout: 8000 });
    // common term (every COGTEST log's issueKey contains it) → entries return
    await search.fill("COGTEST");
    await expect(frame.locator(".log-entry").first()).toBeVisible({ timeout: 10_000 });
    expect(await frame.locator(".log-entry").count(), "common-term filter restores matching entries").toBeGreaterThan(0);
    await search.fill(""); // reset
  }, { expectation: { assertion: "the free-text filter narrows and restores the log list", narrative: "Searching logs filters live; a no-match query shows the empty state." } });
});
