// LIVE BROWSER — admin Settings tab: AI provider configuration (journey J1, read-only / non-mutating).
// Drives the real admin panel (Forge globalPage iframe). Asserts the Settings tab renders the provider
// picker (a CUSTOM dropdown — house rule bans native <select>) listing all providers with the ACTIVE one
// marked; the active provider reconciles with the ?what=kvs COGNIRUNNER_AI_PROVIDER hook; VIEWING a
// different provider surfaces its BYOK key-management + a "Set as active" affordance WITHOUT changing the
// active provider (proven by re-reading the hook — selecting in the dropdown is view-only, active only
// changes via the separate "Set as active" button, which this spec never clicks). Fully reversible: the
// view is reset back to the active provider at the end.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
test.describe.configure({ retries: 2 });

const PROVIDER_LABEL: Record<string, RegExp> = {
  openai: /OpenAI/, azure: /Azure/, openrouter: /OpenRouter/, anthropic: /Anthropic/,
  lmstudio: /LM Studio/, atlassian: /Forge LLM/, bedrock: /Bedrock/,
};

async function activeProviderKey(): Promise<string> {
  const r = await fetch(`${HOOK}?what=kvs&key=COGNIRUNNER_AI_PROVIDER`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`hook kvs read ${r.status}`);
  const v = (await r.json()).value;
  return typeof v === "string" ? v : (v?.provider || "atlassian");
}

test("J1 admin Settings — provider picker renders, active reconciles, viewing is non-mutating", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });

  const activeKey = await activeProviderKey();
  const activeRe = PROVIDER_LABEL[activeKey] || /./;
  console.log(`active provider (KVS): ${activeKey}`);

  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });

  // The provider dropdown is the first CustomSelect in the settings card; re-query it each step
  // since its trigger label changes as the viewed provider changes.
  const providerTrigger = () => frame.locator(".dropdown-trigger").first();

  await recorder.step("open Settings — provider config + active provider reconcile with KVS", async () => {
    await frame.locator(".tab-btn", { hasText: /^\s*Settings\s*$/ }).first().click();
    await expect(frame.locator(".section-title", { hasText: /AI Provider Configuration/i }).first()).toBeVisible({ timeout: 20_000 });
    // The "Active: <label>" line and the picker trigger both show the KVS-active provider.
    await expect(frame.locator("p", { hasText: /Active:/ }).first()).toContainText(activeRe, { timeout: 10_000 });
    await expect(providerTrigger()).toContainText(activeRe);
  }, { expectation: { assertion: "the Settings tab shows the active AI provider, matching KVS", narrative: "First-run/Settings renders the provider configuration and names the provider that actually runs AI." } });

  await recorder.step("provider picker is a custom dropdown listing all providers (no native select)", async () => {
    await providerTrigger().click();
    const panel = frame.locator(".dropdown-panel");
    await expect(panel).toBeVisible({ timeout: 8000 });
    const opts = panel.locator(".dropdown-item");
    const n = await opts.count();
    console.log(`provider options: ${n}`);
    expect(n, "all BYOK + hosted providers are listed").toBeGreaterThanOrEqual(6);
    // House rule: this is a role=option custom listbox, not a native <select>.
    await expect(panel.locator("[role='option']").first()).toBeVisible();
    // The active provider is flagged right in the menu.
    await expect(panel.locator(".dropdown-item", { hasText: /•\s*Active/ })).toContainText(activeRe);
  }, { expectation: { assertion: "the provider picker is a custom dropdown that lists every provider and flags the active one", narrative: "No native browser <select>; the menu makes the running provider unmistakable." } });

  let viewKey: string | null = null;
  await recorder.step("view a different (BYOK) provider → key management + Set-as-active appear", async () => {
    // Pick any provider that isn't the active one (prefer OpenAI; fall back to Anthropic).
    viewKey = activeKey === "openai" ? "anthropic" : "openai";
    const label = PROVIDER_LABEL[viewKey];
    await frame.locator(".dropdown-panel .dropdown-item-name").filter({ hasText: label }).first().click();
    await expect(providerTrigger()).toContainText(label, { timeout: 8000 });
    // Viewing a non-active provider surfaces the "Set as active" affordance (we never click it).
    await expect(frame.locator("button.btn-edit", { hasText: /Set as active/i })).toBeVisible({ timeout: 8000 });
    // BYOK providers show key management: either an empty key input or a masked key + Remove.
    const keyUi = frame.locator("input[type='password']").or(frame.locator("button.btn-danger", { hasText: /Remove Key/i }));
    await expect(keyUi.first()).toBeVisible({ timeout: 8000 });
  }, { expectation: { assertion: "viewing a BYOK provider reveals its key management and a Set-as-active button", narrative: "Each provider's config is browsable without committing to it." } });

  await recorder.step("selecting a provider is VIEW-ONLY — active provider unchanged in KVS", async () => {
    // The KVS-active provider must be untouched: selecting in the picker only browses config.
    const stillActive = await activeProviderKey();
    console.log(`active provider after viewing ${viewKey}: ${stillActive}`);
    expect(stillActive, "browsing a provider did not change the active provider").toBe(activeKey);
    // Reset the view back to the active provider — no "Set as active" once we're viewing it again.
    await providerTrigger().click();
    await frame.locator(".dropdown-panel .dropdown-item-name").filter({ hasText: activeRe }).first().click();
    await expect(providerTrigger()).toContainText(activeRe, { timeout: 8000 });
    await expect(frame.locator("button.btn-edit", { hasText: /Set as active/i })).toHaveCount(0, { timeout: 8000 });
  }, { expectation: { assertion: "browsing providers never changes which one is active", narrative: "The active provider is a deliberate commit (Set as active), never a side effect of browsing." } });
});
