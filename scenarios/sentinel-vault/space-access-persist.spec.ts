// DEEP space-access persistence round-trip (COVERAGE-MATRIX worklist #5). Two safe round-trips on
// the realm-console Access Control tab, both persisting via store-policy(space) → admin-settings-space-WFH:
//   (1) ACTIVATION dropdown: flip use-system-default↔enabled (BENIGN — never "disabled") → Apply →
//       assert admin-settings-space-WFH.activation persisted → reload shows it.
//   (2) STEWARD REMOVE: SEED a SYNTHETIC operator into adminUsers (durable baseline preserved — never
//       touch a real steward) → remove its chip → Apply → assert it's gone + the REAL stewards remain.
// DURABLE-BASELINE RULE (it47): capture admin-settings-space-WFH ONCE, restore exactly, verify no
// synthetic leftovers. Dev-scoped.
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("sentinel-vault-realm");
const POLICY = "admin-settings-space-WFH";
const SYNTH = "712020:aql-synth-steward";
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const adminIds = (p: any) => (p?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId));
async function openAccessControl(page: any) {
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  const app = (s as any).frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
  await app.locator(".tab-navigation .tab-button", { hasText: "Access Control" }).click();
  await page.waitForTimeout(1800);
  return app;
}
const restore = async (orig: any) => { if (orig) await setKvs(POLICY, orig); else await delKvs(POLICY); };
test.describe.configure({ retries: 2 });

test("space ACTIVATION persists across reload (store-policy space)", async ({ page }) => {
  const orig = await getKvs(POLICY);
  const cur = orig?.activation || "use-system-default";
  const target = cur === "enabled" ? "use-system-default" : "enabled"; // benign flip, never 'disabled'
  const label = target === "enabled" ? "Active" : "Use System Default";
  try {
    const app = await openAccessControl(page);
    await app.locator(".custom-select").first().click();
    await app.locator(".custom-select-dropdown").getByText(label, { exact: true }).click();
    await app.locator(".action-bar .btn-primary:visible", { hasText: /Apply/i }).first().click();
    await expect.poll(async () => (await getKvs(POLICY))?.activation, { timeout: 15000, message: "activation persisted via store-policy" }).toBe(target);
    console.log("### activation persisted:", target, "✓");
    const app2 = await openAccessControl(page);
    await expect(app2.locator(".custom-select .select-value"), "activation label persists after reload").toContainText(label, { timeout: 10000 });
    console.log("### activation label after reload ✓");
  } finally {
    await restore(orig);
  }
});

test("remove a (seeded synthetic) steward operator persists; real stewards preserved", async ({ page }) => {
  const orig = await getKvs(POLICY);
  const realIds = adminIds(orig);
  await setKvs(POLICY, { ...(orig || {}), adminUsers: [ ...((orig?.adminUsers) || []), { accountId: SYNTH, displayName: "AQL Synth Steward" } ] });
  try {
    const app = await openAccessControl(page);
    const card = app.locator(".steward-card", { hasText: "AQL Synth Steward" });
    await expect(card, "seeded synthetic steward shows in the Stewards list").toBeVisible({ timeout: 15000 });
    await card.locator(".steward-remove").click();
    await app.locator(".action-bar .btn-primary:visible", { hasText: /Apply/i }).first().click();
    await expect.poll(async () => adminIds(await getKvs(POLICY)).includes(SYNTH), { timeout: 15000, message: "synthetic steward removed + persisted" }).toBe(false);
    const after = adminIds(await getKvs(POLICY));
    for (const id of realIds) expect(after, "real stewards preserved").toContain(id);
    console.log("### synthetic removed + real stewards preserved ✓");
  } finally {
    await restore(orig);
    const check = adminIds(await getKvs(POLICY));
    if (check.includes(SYNTH)) throw new Error("SYNTHETIC STEWARD LEFTOVER — durable baseline not restored!");
  }
});
