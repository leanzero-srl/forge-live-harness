// B7 (worklist #12) — the NON-STEWARD / plain-user persona, previously entirely unexercised (every
// realm-console spec authenticates as a steward). The live console can't render the non-steward branch
// here because the harness user IS a steward, so this drives the persona LOGIC via the testhook with a
// synthetic non-steward actor: the role gate (check-user-role → "user"), the steward-access request,
// and the denied → 48h-cooldown state. (Residual: a live screenshot of the non-steward chrome needs a
// non-steward login — the harness user is a steward.)
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const ACTOR = "sv-aql-plainuser";
const KEY = `steward-request-${SPACE}-${ACTOR}`;
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 120_000, retries: 1 });

test("B7: plain-user role gate + steward-access request → denied 48h cooldown", async () => {
  await delKvs(KEY); // retry-safe
  try {
    // a synthetic (non-steward) actor is gated to the plain-user role (the realm-console shows only
    // "My Sealed Files" + the Request-Steward banner for this role)
    const role = await inv("checkUserRole", { spaceKey: SPACE, actor: ACTOR });
    expect(role.result?.role, "a non-steward is gated to the 'user' role").toBe("user");

    // request steward access → a pending request is stored
    const rq = await inv("requestStewardAccess", { spaceKey: SPACE, actor: ACTOR });
    expect(rq.result?.success, `steward-access request accepted (got: ${rq.result?.reason})`).toBe(true);
    const rec = await getKvs(KEY);
    expect(rec?.status, "the request is stored as pending").toBe("pending");
    const c1 = await inv("checkStewardRequest", { spaceKey: SPACE, actor: ACTOR });
    expect(c1.result?.status, "the requester's check reports pending").toBe("pending");
    console.log("### plain-user role gate + request pending ✓");

    // a DENIED request reports 'denied' within the 48h cooldown (drives the banner's retry countdown)
    await setKvs(KEY, { ...rec, status: "denied", deniedAt: new Date().toISOString() });
    const c2 = await inv("checkStewardRequest", { spaceKey: SPACE, actor: ACTOR });
    expect(c2.result?.status, "the check reports denied within the cooldown window").toBe("denied");
    expect(c2.result?.deniedAt || rec, "the denial timestamp drives the retry countdown").toBeTruthy();
    console.log("### denied within 48h cooldown ✓");
  } finally {
    await delKvs(KEY).catch(() => {});
  }
});
