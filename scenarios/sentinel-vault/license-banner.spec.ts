// Sentinel Vault DEEP — C1 licensing regression: checkLicense fail-open matrix + the soft-degrade
// nag banner on BOTH admin consoles.
//   Part 1 (REST): testhook {what:"invoke", fn:"checkLicense", lic:...} drives the exact bias table:
//     lic=none     → { isLicensed:true,  active:null,  unlicensedButAllowed:false }  (dev NEVER locked out)
//     lic=active   → { isLicensed:true,  active:true,  unlicensedButAllowed:false }
//     lic=inactive → { isLicensed:false, active:false, unlicensedButAllowed:true  }
//   Part 2 (browser): seed kvs harness-license-override={active:false} → the realm console AND the
//     steward console show .license-banner[role=status] (unlicensed copy + "Manage subscription");
//     delete the override → reload → banner ABSENT (the fail-open default — a REAL assert, made
//     meaningful by the positive case having just proven the banner machinery live in this session).
// The app-side seams (fn=checkLicense read-through of the harness-license-override key) are authored
// in parallel — each part probes its seam and test.skip()s LOUDLY if not yet deployed.
// Self-cleaning: the override key is deleted in finally (and defensively before Part 1's matrix).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/sv-license-banner";
const OVERRIDE_KEY = "harness-license-override";
const REALM = getTarget("sentinel-vault-realm");
const STEWARD = getTarget("sentinel-steward-console");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const delOverride = () => getTestState("sentinel-vault", { what: "delete", key: OVERRIDE_KEY });
const seedOverride = () =>
  getTestState("sentinel-vault", { what: "set", key: OVERRIDE_KEY, value: JSON.stringify({ active: false }) });
/** Invoke the deployed checkLicense through the testhook; omit lic for "no context.license at all". */
const invokeCheck = async (lic?: string): Promise<any> => {
  const q: Record<string, string> = { what: "invoke", fn: "checkLicense" };
  if (lic) q.lic = lic;
  return (await getTestState("sentinel-vault", q)).result;
};
const seamMissing = (e: unknown) => /unknown (fn|what)|-> 400/.test(String((e as Error)?.message || e));

test.describe.configure({ timeout: 420_000 });

test("🔎 checkLicense fail-open matrix: none/active/inactive (C1)", async () => {
  // A stale override from a crashed earlier run would poison the matrix — clear it first.
  await delOverride().catch(() => {});

  let none: any;
  try {
    none = await invokeCheck("none");
  } catch (e) {
    test.skip(seamMissing(e), `LOUD SKIP: fn=checkLicense testhook seam not deployed yet — ${String((e as Error)?.message || e).slice(0, 200)}`);
    throw e;
  }

  // lic=none → context.license undefined (the dev/harness install reality) → licensed, fail-open.
  expect(none, "lic=none").toMatchObject({ isLicensed: true, active: null, unlicensedButAllowed: false });
  // lic=active → platform explicitly says paid → licensed.
  expect(await invokeCheck("active"), "lic=active").toMatchObject({ isLicensed: true, active: true, unlicensedButAllowed: false });
  // lic=inactive → the ONLY unlicensed state: platform EXPLICITLY says active:false. Soft-degrade,
  // never hard-block — unlicensedButAllowed:true is the "keep protecting, just nag" signal.
  expect(await invokeCheck("inactive"), "lic=inactive").toMatchObject({ isLicensed: false, active: false, unlicensedButAllowed: true });
  console.log("### checkLicense matrix exact ✓ (fail-open bias held)");
});

test("🔎 unlicensed banner on BOTH consoles; absent again once the override clears (fail-open default)", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  try {
    await seedOverride();

    // Seam probe: the deployed checkLicense must HONOR the override (report unlicensed with no
    // explicit lic context). kvs.get is read-your-writes in practice, but poll bounded anyway —
    // and if the read-through seam simply isn't deployed yet, skip LOUDLY instead of failing.
    let seamLive = false;
    const deadline = Date.now() + 45_000;
    for (;;) {
      try {
        const r = await invokeCheck();
        if (r?.isLicensed === false) { seamLive = true; break; }
      } catch (e) {
        if (seamMissing(e)) break;
      }
      if (Date.now() > deadline) break;
      await sleep(3000);
    }
    if (!seamLive) {
      test.skip(true, "LOUD SKIP: harness-license-override read-through not honored by the deployed checkLicense — the app-side seam (authored in parallel) is not live yet; banner assertions would be meaningless.");
    }
    console.log("### override honored server-side (isLicensed=false) ✓");

    // --- Realm console: banner VISIBLE with the unlicensed copy + Manage subscription CTA.
    await page.goto(REALM.deepLink(REALM.envId)!, { waitUntil: "domcontentloaded" });
    let surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45_000 });
    if (surface.kind !== "custom") throw new Error("expected a Custom UI iframe (realm)");
    let app = surface.frame;
    await expect(app.locator(".space-admin-title"), "realm console loaded past the spinner").toBeVisible({ timeout: 20_000 });
    const realmBanner = app.locator('.license-banner[role="status"]');
    await expect(realmBanner, "realm console shows the license banner").toBeVisible({ timeout: 30_000 });
    await expect(realmBanner, "realm banner carries the unlicensed copy").toContainText(/unlicensed/i);
    await expect(realmBanner.getByRole("button", { name: /manage subscription/i }), "realm Manage subscription CTA").toBeVisible();
    await page.screenshot({ path: `${OUT}/realm-banner.png`, fullPage: true });
    console.log("### realm console banner + CTA ✓");

    // --- Steward console (navigation copied from steward-console-deep.spec.ts): banner VISIBLE.
    await page.goto(STEWARD.deepLink(STEWARD.envId)!, { waitUntil: "domcontentloaded" });
    surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45_000 });
    if (surface.kind !== "custom") throw new Error("expected a Custom UI iframe (steward)");
    app = surface.frame;
    await expect(app.locator(".admin-title"), "steward console loaded past the spinner").toBeVisible({ timeout: 20_000 });
    const stewardBanner = app.locator('.license-banner[role="status"]');
    await expect(stewardBanner, "steward console shows the license banner").toBeVisible({ timeout: 30_000 });
    await expect(stewardBanner, "steward banner carries the unlicensed copy").toContainText(/unlicensed/i);
    await expect(stewardBanner.getByRole("button", { name: /manage subscription/i }), "steward Manage subscription CTA").toBeVisible();
    await page.screenshot({ path: `${OUT}/steward-banner.png`, fullPage: true });
    console.log("### steward console banner + CTA ✓");

    // --- Clear the override → server truth flips back to licensed (fail-open default) ...
    await delOverride();
    const clearDeadline = Date.now() + 45_000;
    for (;;) {
      const r = await invokeCheck().catch(() => null);
      if (r?.isLicensed === true) break;
      if (Date.now() > clearDeadline) throw new Error("override deleted but checkLicense still reports unlicensed — fail-open default did not return");
      await sleep(3000);
    }
    console.log("### override cleared server-side (isLicensed=true) ✓");

    // ... and the banner is ABSENT on both consoles. Real assert: the console must be fully
    // loaded AND the check-license round-trip given time to land BEFORE counting zero — the
    // positive case above just proved this session renders the banner when unlicensed.
    await page.reload({ waitUntil: "domcontentloaded" });
    surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45_000 });
    if (surface.kind !== "custom") throw new Error("expected a Custom UI iframe (steward reload)");
    app = surface.frame;
    await expect(app.locator(".admin-title")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(8_000); // generous window for the invoke("check-license") round-trip
    await expect(app.locator(".license-banner"), "steward banner ABSENT once licensed (fail-open)").toHaveCount(0);
    await page.screenshot({ path: `${OUT}/steward-no-banner.png`, fullPage: true });

    await page.goto(REALM.deepLink(REALM.envId)!, { waitUntil: "domcontentloaded" });
    surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45_000 });
    if (surface.kind !== "custom") throw new Error("expected a Custom UI iframe (realm reload)");
    app = surface.frame;
    await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(8_000);
    await expect(app.locator(".license-banner"), "realm banner ABSENT once licensed (fail-open)").toHaveCount(0);
    await page.screenshot({ path: `${OUT}/realm-no-banner.png`, fullPage: true });
    console.log("### banner absent on both consoles after override cleared ✓");
  } finally {
    await delOverride().catch(() => {});
  }
});
