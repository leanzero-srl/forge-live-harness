// Coverage gap (2026-09-05) — load-bulletin-toggles, the read behind flashMessagesEnabled() (the
// toast gate on every surface) and the other notification flags. Flips ONLY enableFlashMessages on
// the shared admin-settings-global and asserts ENABLE_TOAST_DISPATCHES follows it both ways while
// the sibling flags keep answering from the untouched fields. The global object is restored to the
// captured value EXACTLY and compared after restore (it47: touch one field, put the object back
// as found — this spec adds nothing and leaves nothing).
// @covers resolver:load-bulletin-toggles
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const KEY = "admin-settings-global";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 90_000, retries: 1 });

test("load-bulletin-toggles follows enableFlashMessages; the global is put back exactly", async () => {
  const orig = await getKvs(KEY);
  const base = orig && typeof orig === "object" ? orig : {};
  const expectSiblings = (flags: any) => {
    expect(flags.ENABLE_PAGE_BANNERS, "doc-ribbon flag answers from the untouched field").toBe(base.enableDocRibbons !== false);
    expect(flags.ENABLE_CONFLUENCE_BULLETINS, "comment channels are opt-in (=== true) since 2026-09-15").toBe(base.enableConfluenceDispatches === true);
    expect(flags.ENABLE_NATIVE_NOTIFICATIONS, "comment channels are opt-in (=== true) since 2026-09-15").toBe(base.enableEmailDispatches === true);
    expect(flags.ENABLE_HALFWAY_REMINDER_NOTICE).toBe(base.enableSealExpiryReminderEmail !== false);
    expect(flags.ENABLE_EXPIRY_NOTICE).toBe(base.enableAutoUnsealDispatchEmail !== false);
    expect(flags.ENABLE_PERIODIC_REMINDER_BANNER).toBe(base.enablePeriodicReminderEmail !== false);
  };
  try {
    await setKvs(KEY, { ...base, enableFlashMessages: false });
    const off = await inv("loadBulletinToggles");
    expect(off.result?.success).toBe(true);
    expect(off.result?.flags?.ENABLE_TOAST_DISPATCHES, "toasts OFF when enableFlashMessages is false").toBe(false);
    expectSiblings(off.result.flags);

    await setKvs(KEY, { ...base, enableFlashMessages: true });
    const on = await inv("loadBulletinToggles");
    expect(on.result?.flags?.ENABLE_TOAST_DISPATCHES, "toasts ON when enableFlashMessages is true").toBe(true);
    expectSiblings(on.result.flags);
    console.log(`### load-bulletin-toggles ✓ (toast flag false→true follows the field; siblings unchanged)`);
  } finally {
    if (orig) await setKvs(KEY, orig); else await delKvs(KEY);
  }
  const restored = await getKvs(KEY);
  expect(restored, "admin-settings-global restored EXACTLY as captured").toEqual(orig ?? null);
  const after = await inv("loadBulletinToggles");
  expect(after.result?.flags?.ENABLE_TOAST_DISPATCHES, "…and the flag reads as it did before the test").toBe(base.enableFlashMessages !== false);
});
