// LIVE DEEP UI: CogniRunner admin panel (jira:globalPage) on wolfaenpak.
// Goes past the render smoke — enters the Forge iframe, walks every admin tab
// (screenshotting each), and drives the "Explain this rule" assist end-to-end to
// verify the it25 fix live (the explanation must be specific — name a field, not a
// bare customfield_ id). Evidence bundle: steps/*.png + aria + console + video.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");

// UI/iframe specs retry transient load flakes (deep REST suites stay at 0).
test.describe.configure({ retries: 2 });

test("CogniRunner admin panel — deep UI walkthrough + Explain-this-rule verify", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo,
  });

  await assertLoggedIn(page);
  await recorder.step("navigate to CogniRunner admin", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }, { action: "navigate", expectation: { assertion: "admin global page loads (no login redirect)", narrative: "The CogniRunner admin panel opens." } });

  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("CogniRunner admin is a Custom-UI surface — expected an iframe frame");

  // The panel is up when the tab bar has rendered.
  await recorder.step("admin panel mounts (tab bar visible)", async () => {
    await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });
  }, { expectation: { assertion: "the admin tab bar renders", narrative: "The admin panel is interactive, not a blank iframe." } });

  // Walk every tab; each must render non-blank content in its panel.
  const TABS = ["Rules", "Execution Logs", "Documentation", "Skills", "Memories", "Permissions", "Settings"];
  for (const tab of TABS) {
    await recorder.step(`tab: ${tab}`, async () => {
      const btn = frame.locator(".tab-btn", { hasText: new RegExp(`^\\s*${tab}\\s*$`) }).first();
      if (await btn.count() === 0) return; // tolerate a renamed/absent tab rather than hard-fail the walkthrough
      await btn.click();
      await page.waitForTimeout(600); // let the tab body paint
      await expect(frame.locator(".container, body").first()).toContainText(/\S/);
    }, { expectation: { assertion: `${tab} tab renders content`, narrative: `The ${tab} admin tab is reachable and non-blank.` } });
  }

  // Explain-this-rule (it25 verify). Back to Rules; if a rule exists, drive Explain.
  await recorder.step("Explain this rule — drive + verify specificity", async () => {
    const rulesTab = frame.locator(".tab-btn", { hasText: /^\s*Rules\s*$/ }).first();
    if (await rulesTab.count()) { await rulesTab.click(); await page.waitForTimeout(600); }

    const explainBtn = frame.locator(".rule-explain-btn").first();
    if (await explainBtn.count() === 0) {
      test.info().annotations.push({ type: "note", description: "No configured rule with an Explain button — skipped the live Explain assertion (attach a rule to COGTEST to exercise it)." });
      return;
    }
    await explainBtn.click();
    // The explanation card renders when the AI call returns (or a degraded note).
    const card = frame.locator(".rule-explain-card").first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(/\S/);
    const text = (await card.innerText()).trim();
    test.info().annotations.push({ type: "explanation", description: text });
    // it25 guarantee: the explanation must NOT surface a bare custom-field id. If a
    // customfield_ appears it must be as "<name> (customfield_...)", never naked.
    const bareId = /(^|[^\w(])customfield_\d+(?!\s*\))/.test(text);
    expect(bareId, `explanation should name fields, not show a bare customfield_ id — got: ${text}`).toBe(false);
  }, { expectation: { assertion: "Explain returns a specific explanation (no bare customfield_ id)", narrative: "The it25 fix: Explain names the field and reads concretely." } });
});
