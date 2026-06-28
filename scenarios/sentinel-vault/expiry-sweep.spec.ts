// Sentinel Vault DEEP — the expiry-sweep SCHEDULED task (previously NONE-GAP: the whole scheduled
// tier was untested). Invoked on demand via the dev hook. A synthetic EXPIRED media seal with
// contentId:null (so the sweep skips the comment → no real-page side effect) must be picked up:
// the sweep sets its `expiry-notified` dedup flag + records a dispatch event.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const DUMMY = "557058:dummy-other";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;

test.describe.configure({ timeout: 120_000 });

test("🔎 the expiry-sweep scheduled task flags an expired seal (sets the dedup flag)", async () => {
  const attId = `harness-expiry-${Date.now().toString(36)}`;
  const past = new Date(Date.now() - 86400000).toISOString(); // yesterday
  try {
    await setKvs(`protection-${attId}`, { timestamp: past, expiresAt: past, lockedBy: DUMMY, attachmentName: "harness-expiry-test", contentId: null });
    await delKvs(`expiry-notified-${attId}`);
    expect(await getKvs(`expiry-notified-${attId}`), "no dedup flag before the sweep").toBeFalsy();

    const res = await getTestState("sentinel-vault", { what: "invoke", fn: "expirySweep" });
    console.log(`expirySweep → ${JSON.stringify(res.result)}`);

    const flag = await getKvs(`expiry-notified-${attId}`);
    console.log(`expiry-notified-${attId} → ${JSON.stringify(flag)}`);
    expect(flag, "the sweep set the expiry-notified dedup flag for the expired seal").toBeTruthy();
    expect(flag.attachmentId, "the flag records the attachment id").toBe(attId);
  } finally {
    await delKvs(`protection-${attId}`).catch(() => {});
    await delKvs(`expiry-notified-${attId}`).catch(() => {});
  }
});
