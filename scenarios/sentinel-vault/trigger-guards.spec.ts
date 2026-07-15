// B12 (worklist #12) — GUARD-ONLY coverage of the invasive background tiers. These handlers process
// EVERY real seal / delete the whole KVS, so we NEVER exercise their scan bodies — only the early-return
// guards that must fire before any invasive work. (realmScanConsumer + sealIndexCron have no clean pure
// guard and are left as documented residuals; forcing their skip risks an instance-wide scan.)
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 60_000, retries: 1 });

test("B12: lifecycleTrigger does NOT wipe the KVS on a non-uninstall event", async () => {
  // lifecycleTrigger mass-deletes the ENTIRE KVS namespace on avi:forge:uninstalled:app. The eventType
  // guard must skip the whole body for any other event. Seed a canary; fire "installed"; canary survives.
  const canary = `b12-canary-${Math.floor(Math.random() * 1e9)}`;
  try {
    await setKvs(canary, { v: 1 });
    const r = await inv("lifecycleGuard", { event: "avi:forge:installed:app" });
    expect(r.result?.ran, "the lifecycle handler ran the guard path").toBe(true);
    expect(await getKvs(canary), "a non-uninstall event must NOT wipe KVS keys").not.toBeNull();
    console.log("### lifecycleTrigger guard: installed event left the canary intact (no wipe) ✓");
  } finally {
    await delKvs(canary).catch(() => {});
  }
});

test("B12: recurringNudgeTask early-returns when auto-unseal is active (no seal scan)", async () => {
  // The nudge scans ALL protection-* seals — but only when auto-unseal is DISABLED. When active
  // (autoUnlockEnabled !== false) it returns {reminderCount:0} before the scan. The testhook seam
  // self-refuses if auto-unseal is disabled, so this can never trigger the invasive branch.
  const g = await getKvs("admin-settings-global");
  test.skip(g?.autoUnlockEnabled === false, "auto-unseal is disabled — the nudge would scan; skip the guard test");
  const r = await inv("recurringNudgeGuard");
  const body = typeof r.result?.body === "string" ? JSON.parse(r.result.body) : r.result;
  expect(body?.reminderCount, "the guard returns reminderCount 0 without scanning").toBe(0);
  console.log("### recurringNudgeTask guard: auto-unseal active → reminderCount 0, no scan ✓");
});
