// Sentinel Vault DEEP — the incident-2026-07-22 Bug-A regression: a sealed IMAGE deleted through
// the REAL Confluence UI (not a v1 REST delete — the UI event omitted version/container on 07-22
// and silently defeated the trash handler) must come back WHOLE:
//   1. attachment restored to status "current"           (attachment layer)
//   2. media node back in the page ADF                   (ADF layer)
//   3. the image actually RENDERS in the page view       (what the incident broke: a dead node
//      pointing at a trashed file "passes" 1+2-style checks while the reader sees nothing)
//   4. fileId triple-consistency: live v2 fileId == ADF fileId == seal.sealedFileId
//   5. comment discipline: EXACTLY ONE violation comment — the trash handler and the media
//      pass now share one content-loss dedup class, so a single UI delete can never produce
//      two comments (the pre-fix delete/content-removal split let both land)
//   6. the seal KVS triad survives intact
// Seal owner is SYNTHETIC; the signed-in harness user (mihai) is the non-owner "attacker".
// Self-cleaning: throwaway page owns the attachment; KVS keys deleted in finally.
import { test, expect } from "../../fixtures/forge";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadBinaryAttachment, TINY_PNG, mediaNodeWithAttrs, readPage, getAttachment, pollAttachmentStatus, countCommentsMatching, writeAdf, setContentProperty } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { mkdirSync } from "node:fs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DUMMY = "557058:dummy-other";
const OUT = "/tmp/sv-ui-delete";
const EXPECT_MAX_COMMENTS = Number(process.env.SV_EXPECT_MAX_VIOLATION_COMMENTS || 1);

const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.describe.configure({ timeout: 300_000 });

test("🔎 UI-deleted sealed image is restored AND renders (incident 2026-07-22 Bug A)", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const stamp = Date.now();
  const filename = `sv-bugA-${stamp}.png`;
  const pg = await createPage({ spaceId, title: `HARNESS sv-ui-delete ${stamp}`, adf: doc(para("bugA seed")) });
  let att: any;
  try {
    att = await uploadBinaryAttachment(pg.id, filename, TINY_PNG, "image/png");
    // Embed the image, then seal it for a SYNTHETIC owner (full triad + far-future expiry —
    // expired seals are inert post-Fix-2, so a null/past expiry would void the test).
    const cur = await readPage(pg.id);
    cur.adf.content.push(mediaNodeWithAttrs(att.fileId, pg.id));
    await writeAdf(pg.id, cur.adf, { message: "embed sealed image" });
    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();
    await setKvs(`protection-${att.attachmentId}`, {
      contentId: pg.id, attachmentId: att.attachmentId, sealedFileId: att.fileId,
      lockedBy: DUMMY, lockedByName: "Other", attachmentName: filename, spaceId, expiresAt,
      sealedVersion: 1, lockDuration: 14400, embedded: true,
    });
    // The protection- content property is the media fast-path GATE (collectMediaSealsForPage
    // early-returns without it) — a KVS-only seed leaves the page pipeline blind.
    await setContentProperty(pg.id, "protection-", [{ attachmentId: att.attachmentId, lockedBy: DUMMY }]);
    await setKvs(`space-protection-${spaceId}-${att.attachmentId}`, {
      attachmentId: att.attachmentId, contentId: pg.id, lockedBy: DUMMY, attachmentName: filename,
      lockedOn: new Date().toISOString(), expiresAt,
    });

    // Positive control: the image renders BEFORE the attack (else assert 3 is meaningless).
    const { assertImageRenders, uiDeleteAttachment } = await import("../_support/confluence-ui");
    await assertImageRenders(page, pg.id, OUT);
    console.log("### pre-delete: image renders ✓");

    // THE ATTACK: delete through the real Confluence UI as the signed-in non-owner.
    await uiDeleteAttachment(page, pg.id, filename, OUT);
    console.log("### UI delete issued");

    // 1) attachment layer: back to current.
    await pollAttachmentStatus(att.attachmentId, "current", { timeoutMs: 120_000 });
    console.log("### attachment restored to current ✓");

    // 2) ADF layer: the media node returns (the page trigger may lag the attachment restore).
    let adfHasFile = false;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const now = await readPage(pg.id);
      if (JSON.stringify(now.adf).includes(att.fileId)) { adfHasFile = true; break; }
      await new Promise((r) => setTimeout(r, 4000));
    }
    expect(adfHasFile, "media node back in the page ADF").toBeTruthy();
    console.log("### media node back in ADF ✓");

    // 4) fileId triple-consistency (the exact invariant the live bug broke).
    const live = await getAttachment(att.attachmentId);
    const seal = await getKvs(`protection-${att.attachmentId}`);
    expect(live.status).toBe("current");
    expect(live.fileId, "live fileId == original").toBe(att.fileId);
    expect(seal?.sealedFileId, "seal.sealedFileId == live fileId").toBe(live.fileId);

    // 3) render layer — the assertion no pre-incident spec made.
    await assertImageRenders(page, pg.id, OUT);
    console.log("### post-restore: image RENDERS ✓");

    // 5) comment discipline: bounded violation comments for this unique filename.
    const comments = await countCommentsMatching(pg.id, filename);
    console.log(`### violation comments mentioning ${filename}: ${comments} (max ${EXPECT_MAX_COMMENTS})`);
    expect(comments, "violation comments bounded (no spam)").toBeLessThanOrEqual(EXPECT_MAX_COMMENTS);
    expect(comments, "at least one violation comment posted").toBeGreaterThanOrEqual(1);

    // 6) index consistency: the triad survived.
    expect(seal?.lockedBy, "seal record intact with original owner").toBe(DUMMY);
    expect(await getKvs(`space-protection-${spaceId}-${att.attachmentId}`), "space index row intact").toBeTruthy();
  } finally {
    if (att) {
      await delKvs(`protection-${att.attachmentId}`).catch(() => {});
      await delKvs(`space-protection-${spaceId}-${att.attachmentId}`).catch(() => {});
      await delKvs(`violation-noticed-${pg.id}-${att.attachmentId}-content-loss`).catch(() => {});
    }
    await deletePage(pg.id).catch(() => {});
  }
});
