// DEEP privilege journey (COVERAGE-MATRIX worklist #1 — steward force-unseal, was ZERO coverage).
// A steward force-unseals a NON-expired seal owned by ANOTHER (synthetic) user via the realm-console,
// and the full cleanup runs (seal record + realm-index key + edit-grants + watchers). Seeds the seal
// + secondary records via the dev testhook (no 2nd real user), drives the real UI, asserts the KVS
// teardown, self-cleans. Dev-scoped (realm-console readySelector = new title). WFH realmId 851971.
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("sentinel-vault-realm");
const REALM_ID = "851971", SPACE_KEY = "WFH", PAGE_ID = "265912321";
const ATT = "att-aql-forceunseal";
const OWNER_A = "712020:aql-synth-owner-a";        // a DIFFERENT user than the steward (Mihai)
const EDITOR = "712020:aql-synth-editor";
const WATCHER = "712020:aql-synth-watcher";
const K_SEAL = `protection-${ATT}`;
const K_INDEX = `space-protection-${REALM_ID}-${ATT}`;
const K_GRANT = `edit-grant-${ATT}-${EDITOR}`;
const K_WATCH = `notification-${ATT}-${WATCHER}`;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const cleanup = async () => { for (const k of [K_SEAL, K_INDEX, K_GRANT, K_WATCH]) await delKvs(k).catch(()=>{}); };
const GLOBAL = "admin-settings-global";
const seedSeal = async () => {
  const future = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const common = { attachmentId: ATT, attachmentName: "AQL-FORCE-UNSEAL.bin", lockedBy: OWNER_A, lockedByName: "AQL Synth A", timestamp: new Date().toISOString(), expiresAt: future, contentId: PAGE_ID, spaceKey: SPACE_KEY, spaceId: REALM_ID };
  await setKvs(K_SEAL, { ...common, lockDuration: 259200, sealedVersion: 1 });
  await setKvs(K_INDEX, { ...common, pageTitle: "SV AQL Seal Fixture (do not delete)", fileSize: 1024, creatorAccountId: OWNER_A, creatorName: "AQL Synth A" });
  return future;
};
test.describe.configure({ retries: 2 });

test("steward force-unseals another user's seal via the realm-console → full cleanup", async ({ page }) => {
  await cleanup();
  const future = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const common = { attachmentId: ATT, attachmentName: "AQL-FORCE-UNSEAL.bin", lockedBy: OWNER_A, lockedByName: "AQL Synth A", timestamp: new Date().toISOString(), expiresAt: future, contentId: PAGE_ID, spaceKey: SPACE_KEY, spaceId: REALM_ID };
  await setKvs(K_SEAL, { ...common, lockDuration: 259200, sealedVersion: 1 });
  await setKvs(K_INDEX, { ...common, pageTitle: "SV AQL Seal Fixture (do not delete)", fileSize: 1024, creatorAccountId: OWNER_A, creatorName: "AQL Synth A" });
  await setKvs(K_GRANT, { artifactId: ATT, editorAccountId: EDITOR, editorName: "AQL Editor", grantedBy: OWNER_A, grantedAt: new Date().toISOString(), expiresAt: future });
  await setKvs(K_WATCH, { attachmentId: ATT, watcherAccountId: WATCHER, createdAt: new Date().toISOString() });
  try {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
    if (s.kind !== "custom") throw new Error("expected Custom UI");
    const app = s.frame;
    await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
    await app.locator(".tab-navigation .tab-button", { hasText: "Sealed Files" }).click().catch(()=>{});
    await page.waitForTimeout(2500);
    // find the seeded card (steward view lists all seals from the realm index)
    const card = app.locator(".artifact-card", { hasText: "AQL-FORCE-UNSEAL" });
    await expect(card, "seeded seal appears in the steward Sealed Files list").toBeVisible({ timeout: 15000 });
    const forceBtn = card.locator(".action-btn.unlock", { hasText: "Force Unseal" });
    await expect(forceBtn, "Force Unseal button present (steward + override-on gating)").toBeVisible();
    await forceBtn.click();
    // The resolver deletes the seal FIRST, then (still in the same call) the index key, watcher
    // records and edit-grants (sweepEditAccess) + owner email. Poll EACH so we wait for the full
    // cleanup to land rather than racing the still-running resolver.
    await expect.poll(async () => await getKvs(K_SEAL), { timeout: 20000, message: "seal record deleted by steward-unseal" }).toBeFalsy();
    console.log("### seal record deleted ✓");
    await expect.poll(async () => await getKvs(K_INDEX), { timeout: 15000, message: "realm-index key deleted" }).toBeFalsy();
    await expect.poll(async () => await getKvs(K_GRANT), { timeout: 15000, message: "edit-grant swept (sweepEditAccess)" }).toBeFalsy();
    await expect.poll(async () => await getKvs(K_WATCH), { timeout: 15000, message: "watcher notification deleted" }).toBeFalsy();
    console.log("### index/grant/watcher cleanup ✓");
  } finally {
    await cleanup();
  }
});

test("steward force-unseal DENIED when allowAdminOverride is OFF → Force Unseal button hidden", async ({ page }) => {
  // authorizeSteward + the UI's steward-override-enabled both gate on the SAME global flag
  // (admin-settings-global.allowAdminOverride). With it OFF, a steward cannot force-unseal a
  // NON-expired seal — the resolver returns "Admin override denied" and the UI hides the button.
  await cleanup();
  const originalGlobal = await getKvs(GLOBAL); // preserve (restore EXACTLY in finally)
  await seedSeal();
  await setKvs(GLOBAL, { ...(originalGlobal || {}), allowAdminOverride: false }); // override OFF globally
  try {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
    const app = (s as any).frame;
    await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
    await app.locator(".tab-navigation .tab-button", { hasText: "Sealed Files" }).click().catch(()=>{});
    await page.waitForTimeout(2500);
    const card = app.locator(".artifact-card", { hasText: "AQL-FORCE-UNSEAL" });
    await expect(card, "seeded seal still listed for the steward").toBeVisible({ timeout: 15000 });
    // override OFF ⇒ the steward CANNOT force-unseal ⇒ no Force Unseal button on the card
    await expect(card.locator(".action-btn.unlock", { hasText: "Force Unseal" }),
      "Force Unseal is hidden when allowAdminOverride is off").toHaveCount(0);
    // and the seal is NOT deleted (still present)
    expect(await getKvs(K_SEAL), "seal untouched (denied)").toBeTruthy();
    console.log("### override OFF → Force Unseal button hidden + seal untouched (denied) ✓");
  } finally {
    if (originalGlobal) await setKvs(GLOBAL, originalGlobal); else await delKvs(GLOBAL);
    await cleanup();
  }
});
