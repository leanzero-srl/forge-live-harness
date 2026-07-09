// DEEP live-UI test for Sentinel Vault's realm-console (Confluence space page) on wolfaenpak.
// Unlike the render smoke (which only proves "not blank" — a SPINNER passes that), this drives
// the real deployed app: it waits for the console to load PAST the "Preparing…" spinner (the
// regression guard for the it26 stuck-loading hang) and then clicks EVERY tab, asserting each
// renders real content with no error banner. Requires `forge install --upgrade` so the served
// frontend is current. Uses the shared .auth/profile session.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { BASE_URL } from "../../config/env";

const T = getTarget("sentinel-vault-realm");
test.describe.configure({ retries: 2 });

test("realm-console loads past the spinner + every tab renders (deep)", async ({ page, recorder }) => {
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + T.deepLink(T.envId), repo: T.repo,
  });

  await recorder.step("navigate to the space page", async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  }, { expectation: { assertion: "the realm-console space page loads", narrative: "The space page opens (not the login screen)." } });

  // Enter the app iframe, WAITING for the loaded tab bar (a spinner does NOT match this
  // readySelector) — asserts the app actually finished loading. This FAILS on the it26 hang.
  const surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  if (surface.kind !== "custom") throw new Error("expected a Custom UI iframe");
  const app = surface.frame;

  await recorder.step("console renders past the loading spinner (it26 regression guard)", async () => {
    await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
    await expect(app.getByText("Preparing", { exact: false })).toHaveCount(0);
  }, { expectation: { assertion: "the console renders past the 'Preparing…' spinner (not hung)", narrative: "The realm-console fully loads — guards the it26 stuck-loading hang." } });

  const title = (await app.locator(".space-admin-title").innerText().catch(() => "")).trim();
  console.log("### TITLE:", JSON.stringify(title));
  expect(/preferences/i.test(title), "console title present").toBeTruthy();

  const tabs = app.locator(".tab-navigation .tab-button");
  const n = await tabs.count();
  const names: string[] = [];
  for (let i = 0; i < n; i++) names.push((await tabs.nth(i).innerText()).trim());
  console.log("### TABS:", JSON.stringify(names));
  expect(n, "at least the Sealed Files + a few tabs render").toBeGreaterThanOrEqual(3);

  for (let i = 0; i < n; i++) {
    const name = names[i] || `tab${i}`;
    await recorder.step(`tab: ${name}`, async () => {
      await tabs.nth(i).click();
      await page.waitForTimeout(1100);
      const body = (await app.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      expect(body.length, `"${name}" tab content`).toBeGreaterThan(60);
      expect(/could not load|failed to load|unable to load|something went wrong/i.test(body), `"${name}" tab error banner`).toBeFalsy();
      expect(/\bPreparing\b/i.test(body), `"${name}" tab stuck on spinner`).toBeFalsy();
    }, { expectation: { assertion: `the "${name}" tab renders real content (not blank, error, or spinner)`, narrative: `Deep-clicks the ${name} tab and asserts its content.` } });
  }
});
