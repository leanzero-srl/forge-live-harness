// LIVE BROWSER — admin Permissions tab (journey J12, READ-ONLY / non-destructive). Drives the real admin
// panel (Forge globalPage iframe). Asserts the role legend (viewer/editor/admin), a CUSTOM search input +
// role picker (house rule: no native controls), and that the current-users list renders + reconciles
// EXACTLY with the getAppAdmins/app_admins KVS hook. Exercises the read-only user SEARCH path (gibberish →
// "No users found"). NEVER drives add/remove/role-change — searchUsers is a read; addAppAdmin /
// removeAppAdmin / updateUserRole (destructive, G5) are only asserted to RENDER, never invoked.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
test.describe.configure({ retries: 2 });

async function appAdmins(): Promise<any[]> {
  const r = await fetch(`${HOOK}?what=kvs&key=app_admins`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`hook kvs read ${r.status}`);
  const v = (await r.json()).value;
  return Array.isArray(v) ? v : [];
}

test("J12 admin Permissions — legend + custom controls + users reconcile with getAppAdmins (read-only)", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });

  const admins = await appAdmins();
  console.log(`app_admins (KVS): ${admins.length} — ${admins.map((a) => a.displayName).join(", ")}`);

  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });

  await recorder.step("open Permissions — header + role legend render", async () => {
    await frame.locator(".tab-btn", { hasText: /^\s*Permissions\s*$/ }).first().click();
    await expect(frame.locator(".perm-title", { hasText: /User Permissions/i })).toBeVisible({ timeout: 20_000 });
    // Role legend: viewer / editor / admin, each with its capability description.
    for (const role of ["Viewer", "Editor", "Admin"]) {
      await expect(frame.locator(".perm-tab .type-badge", { hasText: new RegExp(`^${role}$`) })).toBeVisible();
    }
  }, { expectation: { assertion: "the Permissions tab shows the role legend (viewer/editor/admin)", narrative: "Admins see exactly what each role can do before assigning it." } });

  await recorder.step("controls are custom (house rule: no native select)", async () => {
    // The add-user search is a styled text input; the role picker is a CustomSelect, not a native <select>.
    await expect(frame.locator("input.perm-search-input")).toBeVisible();
    await expect(frame.locator("select")).toHaveCount(0); // NO native <select> anywhere on this tab
    await expect(frame.locator(".perm-search-wrap .dropdown-trigger").first()).toBeVisible();
  }, { expectation: { assertion: "the add-user role picker is a custom dropdown, not a native select", narrative: "Every control matches the app's design system — no jarring native chrome." } });

  await recorder.step("current-users list reconciles EXACTLY with getAppAdmins/app_admins", async () => {
    // Wait for load to settle: loaded cards carry a Remove button (skeletons don't).
    await expect(frame.locator(".perm-remove-btn").first()).toBeVisible({ timeout: 15_000 });
    const cards = frame.locator(".perm-admin-card");
    const uiCount = await cards.count();
    console.log(`UI user cards: ${uiCount}, KVS app_admins: ${admins.length}`);
    expect(uiCount, "the UI lists exactly the stored app admins").toBe(admins.length);
    // Every stored admin appears by name, and every card exposes a role picker + a Remove control.
    for (const a of admins) {
      await expect(frame.locator(".perm-admin-name", { hasText: a.displayName })).toBeVisible();
    }
    expect(await frame.locator(".perm-remove-btn").count(), "one Remove control per user").toBe(admins.length);
  }, { expectation: { assertion: "the users list renders exactly the stored admins with role + remove controls", narrative: "What the KVS holds is what the admin sees — no drift, one row per user." } });

  await recorder.step("user search path (read-only): gibberish → 'No users found'", async () => {
    // searchUsers is a READ against Jira's user directory — safe. Adding only happens on clicking a result,
    // which we never do. A no-match query proves the debounce→search→empty-state pipeline end to end.
    await frame.locator("input.perm-search-input").fill("zzqqxxnobody7799");
    await expect(frame.locator(".perm-tab", { hasText: /No users found for/i }).first()).toBeVisible({ timeout: 12_000 });
    // Leave the field clean.
    await frame.locator("input.perm-search-input").fill("");
  }, { expectation: { assertion: "searching a non-existent name reports 'No users found'", narrative: "The add-user search runs live and honestly reports an empty result." } });
});
