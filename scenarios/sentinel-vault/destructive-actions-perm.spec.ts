// DEEP permission-matrix coverage (COVERAGE-MATRIX worklist #3 — destructive gated actions
// delete-artifact / purge-seal-record). SAFE: pure testhook invocation with a FAKE attachment id —
// every DENIAL returns before any REST call, and a fake id 404s on the REST probe → NO real
// destruction. Also VERIFIES the audit's over-broad concern (purge "anyone if no seal"). Preserves
// + restores admin-settings-global exactly (the gating toggles).
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
const FAKE_ATT = "att-aql-perm-matrix-fake"; // non-existent → REST 404s → no destruction
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // WFH steward
const SYNTH_A = "712020:aql-seal-owner-a";    // foreign seal owner
const SYNTH_B = "712020:aql-nonsteward-b";    // non-owner, non-steward caller
const GLOBAL = "admin-settings-global";
const K_SEAL = `protection-${FAKE_ATT}`;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const thInvoke = async (fn: string, params: Record<string,string>) => (await getTestState("sentinel-vault", { what: "invoke", fn, ...params })).result;
const seedForeignSeal = () => setKvs(K_SEAL, { lockedBy: SYNTH_A, lockedByName: "AQL Owner A", attachmentId: FAKE_ATT, attachmentName: "aql-perm.bin", timestamp: new Date().toISOString(), spaceKey: "WFH", spaceId: "851971" });

test("destructive-action permission matrix: delete-artifact + purge-seal-record (fake-id, no destruction)", async () => {
  const original = await getKvs(GLOBAL);
  const patch = async (p: any) => setKvs(GLOBAL, { ...((await getKvs(GLOBAL)) || {}), ...p });
  await delKvs(K_SEAL);
  try {
    // 1) delete: gating toggle OFF → denied (no REST)
    await patch({ allowArtifactDelete: false });
    let r = await thInvoke("deleteArtifact", { att: FAKE_ATT, actor: MIHAI });
    expect(r?.success).toBe(false); expect(String(r?.reason)).toMatch(/disabled by admin/i);
    console.log("### delete toggle OFF → denied ✓");

    // 2) delete: attachment sealed by ANOTHER user → blocked (even with toggle ON)
    await patch({ allowArtifactDelete: true });
    await seedForeignSeal();
    r = await thInvoke("deleteArtifact", { att: FAKE_ATT, actor: MIHAI });
    expect(r?.success).toBe(false); expect(String(r?.reason)).toMatch(/sealed by another user/i);
    console.log("### delete foreign-seal → blocked ✓");
    await delKvs(K_SEAL);

    // 3) purge: gating toggle OFF → denied (no REST)
    await patch({ allowSealPurge: false });
    r = await thInvoke("purgeSealRecord", { att: FAKE_ATT, actor: MIHAI });
    expect(r?.success).toBe(false); expect(String(r?.reason)).toMatch(/disabled by admin/i);
    console.log("### purge toggle OFF → denied ✓");

    // 4) purge: foreign seal + non-owner-non-steward → denied
    await patch({ allowSealPurge: true });
    await seedForeignSeal();
    r = await thInvoke("purgeSealRecord", { att: FAKE_ATT, actor: SYNTH_B });
    expect(r?.success).toBe(false); expect(String(r?.reason)).toMatch(/owner or a steward/i);
    console.log("### purge foreign-seal by non-owner → denied ✓");
    await delKvs(K_SEAL);

    // 5) purge: NO seal record + toggle ON → PROCEEDS for ANYONE (audit over-broad concern).
    //    Characterization: fake att → REST probe 404 → no destruction; resolver returns success.
    await patch({ allowSealPurge: true });
    r = await thInvoke("purgeSealRecord", { att: FAKE_ATT, actor: SYNTH_B });
    console.log("### purge NO-seal by non-owner (over-broad?) →", JSON.stringify(r));
    expect(r?.success, "DOCUMENTS current behavior: with no seal record, ANY caller may purge (gated only by allowSealPurge) — FLAGGED for owner decision").toBe(true);
  } finally {
    if (original) await setKvs(GLOBAL, original); else await delKvs(GLOBAL);
    await delKvs(K_SEAL);
  }
});
