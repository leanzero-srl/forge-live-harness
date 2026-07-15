// B13 (worklist #13) — permanent-delete cleanup for a sealed attachment (handleSealedArtifactDeleted,
// fired by avi:confluence:deleted:attachment). A harness can't emit that event, so we drive the exported
// handler directly via the testhook, mirroring the real trigger (it reads the seal record from KVS).
//
// KEY REGRESSION: the final notice used to run UNGUARDED before the record purge, so a notice failure
// (e.g. the page is already gone) aborted every kvs.delete → protection-*/space-protection-*/grants
// orphaned forever, and the deleted attachment kept reading as "still sealed". We fire with a FAKE page
// id so the notice (postDocFootnote) 4xxs, then assert ALL records are purged anyway (ordering fix).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const ATT = "att-b13-test-999";     // synthetic (never a real attachment) — no real seal is touched
const SP = "B13TESTSPACE";
const ED = "editor-b13";
const RQ = "requester-b13";
const FAKE_PAGE = "999000111";       // non-existent → the final notice fails → exercises the ordering fix
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 60_000, retries: 1 });

test("B13: permanent-delete purges all seal records even when the final notice fails", async () => {
  const keys = {
    seal: `protection-${ATT}`,
    spaceIdx: `space-protection-${SP}-${ATT}`,
    grant: `edit-grant-${ATT}-${ED}`,
    request: `edit-request-${ATT}-${RQ}`,
  };
  try {
    // Seed a sealed attachment + its space index + an edit grant and request.
    await setKvs(keys.seal, { contentId: FAKE_PAGE, attachmentId: ATT, lockedBy: "owner-b13", lockedByName: "Owner", attachmentName: "seal-me.txt", spaceId: SP });
    await setKvs(keys.spaceIdx, { attachmentId: ATT, spaceId: SP });
    await setKvs(keys.grant, { artifactId: ATT, editorAccountId: ED });
    await setKvs(keys.request, { artifactId: ATT, requesterAccountId: RQ });

    // Fire the permanent-delete cleanup (fake page → notice fails).
    const r = await inv("handleSealedArtifactDeleted", { att: ATT, page: FAKE_PAGE, actor: "deleter-b13" });
    expect(r.result?.ran, "the cleanup handler ran").toBe(true);

    // Every record is purged despite the notice failure.
    for (const [label, key] of Object.entries(keys)) {
      expect(await getKvs(key), `${label} (${key}) is purged`).toBeNull();
    }
    console.log("### permanent-delete cleanup purged seal + space index + grant + request (notice failed) ✓");
  } finally {
    // Belt-and-suspenders: remove anything that survived a mid-test failure.
    for (const key of Object.values(keys)) await delKvs(key).catch(() => {});
  }
});
