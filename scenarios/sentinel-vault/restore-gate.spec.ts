// B8 (worklist #10) — restore-sealed-artifact GATE + unrecoverable path. Driven SAFELY with a FAKE
// (never-existed) attachment id: the allowSealRestore gate returns before any REST, and a fake id 404s
// on the probe → the unrecoverable branch, so NO real attachment is restored. Manages the shared
// admin-settings-global policy with an it47 durable round-trip. (The 4 MB upload boundary is proven by
// the pure unit test test/upload-limits.test.mjs — a 4 MB base64 payload can't go through the GET testhook.)
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const GKEY = "admin-settings-global";
const FAKE_ATT = "att999999999"; // valid att-id FORMAT but non-existent → 404 probe → unrecoverable branch
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });

test.describe.configure({ timeout: 120_000, retries: 1 });

test("B8: restore-sealed-artifact gate (allowSealRestore) + unrecoverable (permanently-deleted) path", async () => {
  const orig = await getKvs(GKEY);
  try {
    // GATE: allowSealRestore OFF → denied before any REST
    await setKvs(GKEY, { ...(orig || {}), allowSealRestore: false });
    const off = await inv("restoreSealedArtifact", { att: FAKE_ATT, actor: "sv-aql-restorer" });
    expect(off.result?.reason, "restore is denied when allowSealRestore is off").toMatch(/disabled by admin/i);

    // GATE ON + a fake (never-existed) attachment → 404 probe → flagged unrecoverable, no real restore
    await setKvs(GKEY, { ...(orig || {}), allowSealRestore: true });
    const on = await inv("restoreSealedArtifact", { att: FAKE_ATT, actor: "sv-aql-restorer" });
    expect(on.result?.unrecoverable, "a permanently-deleted attachment is flagged unrecoverable").toBe(true);
    expect(on.result?.reason, "the unrecoverable message is shown").toMatch(/permanently deleted|cannot be recovered/i);
    console.log("### restore gate (disabled) + unrecoverable (404 probe) ✓");
  } finally {
    // it47 durable baseline: restore the global policy exactly as captured (or reset the restore flag off).
    if (orig) await setKvs(GKEY, { ...orig, allowSealRestore: orig.allowSealRestore === true });
  }
});
