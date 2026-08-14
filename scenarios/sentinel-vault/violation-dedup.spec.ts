// Sentinel Vault DEEP — Fix 3 regression: cross-run violation-COMMENT dedup.
// The incident-2026-07-22 spam shape: a stale editor draft re-publishing every few minutes
// re-removed the sealed node → every trigger run re-restored AND re-commented. Post-Fix-3 the
// marker violation-noticed-{page}-{att}-{class} (claimed before the comment, TTL 24h) makes it:
// (content loss is ONE dedup class — "content-loss" — shared by the trash handler and the media
// pass, so a UI delete's twin events can't double-comment; the old delete/content-removal split
// is gone)
//   tamper #1 → restore + comment;  tamper #2 (no clean save between) → restore, NO new comment;
//   CLEAN save (violations resolved) → markers cleared → tamper #3 → restore + FRESH comment.
// The restores themselves must happen every time — only the comment is deduped.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadBinaryAttachment, TINY_PNG, mediaNodeWithAttrs, readPage, writeAdf, countCommentsMatching, setContentProperty } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DUMMY = "557058:dummy-other";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.describe.configure({ timeout: 420_000 });

test("🔎 repeat tamper comments ONCE; a clean save re-arms the comment (Fix 3)", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const stamp = Date.now();
  const filename = `sv-dedup-${stamp}.png`;
  const pg = await createPage({ spaceId, title: `HARNESS sv-dedup ${stamp}`, adf: doc(para("dedup seed")) });
  let att: any;
  const removeNode = async () => {
    const cur = await readPage(pg.id);
    const body = JSON.parse(JSON.stringify(cur.adf));
    body.content = body.content.filter((n: any) => !(n?.type === "mediaSingle" && JSON.stringify(n).includes(att.fileId)));
    await writeAdf(pg.id, body, { message: "tamper: remove sealed media" });
  };
  const waitRestored = (label: string) =>
    waitForTerminal(async () => (JSON.stringify((await readPage(pg.id)).adf).includes(att.fileId) ? "restored" : false),
      { timeout: 90_000, interval: 4_000, label });

  try {
    att = await uploadBinaryAttachment(pg.id, filename, TINY_PNG, "image/png");
    const cur = await readPage(pg.id);
    cur.adf.content.push(mediaNodeWithAttrs(att.fileId, pg.id));
    await writeAdf(pg.id, cur.adf, { message: "embed sealed image" });
    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();
    // embedded:true — post-Finding-1 the presence gate ignores seals never embedded in the body.
    await setKvs(`protection-${att.attachmentId}`, {
      contentId: pg.id, attachmentId: att.attachmentId, sealedFileId: att.fileId,
      lockedBy: DUMMY, lockedByName: "Other", attachmentName: filename, spaceId, expiresAt,
      sealedVersion: 1, lockDuration: 14400, embedded: true,
    });
    await setContentProperty(pg.id, "protection-", [{ attachmentId: att.attachmentId, lockedBy: DUMMY }]);

    // Tamper #1 → restore + exactly one comment; the dedup marker is now claimed.
    await removeNode();
    await waitRestored("tamper #1 restored");
    await new Promise((r) => setTimeout(r, 5000)); // let the comment land
    const after1 = await countCommentsMatching(pg.id, filename);
    expect(after1, "tamper #1 commented").toBe(1);
    expect(await getKvs(`violation-noticed-${pg.id}-${att.attachmentId}-content-loss`), "marker claimed").toBeTruthy();

    // Tamper #2 (no clean save between) → restore happens, NO second comment.
    await removeNode();
    await waitRestored("tamper #2 restored (dedup must not stop the RESTORE)");
    await new Promise((r) => setTimeout(r, 8000));
    const after2 = await countCommentsMatching(pg.id, filename);
    expect(after2, "tamper #2 did NOT re-comment (the incident's spam loop)").toBe(1);

    // A CLEAN save (content intact) clears the markers...
    const clean = await readPage(pg.id);
    clean.adf.content.push(para(`clean touch ${stamp}`));
    await writeAdf(pg.id, clean.adf, { message: "clean save" });
    await waitForTerminal(async () => ((await getKvs(`violation-noticed-${pg.id}-${att.attachmentId}-content-loss`)) ? false : "cleared"),
      { timeout: 60_000, interval: 4_000, label: "clean save cleared the dedup marker" });

    // ...so tamper #3 is a NEW incident → fresh comment.
    await removeNode();
    await waitRestored("tamper #3 restored");
    await waitForTerminal(async () => ((await countCommentsMatching(pg.id, filename)) >= 2 ? "commented" : false),
      { timeout: 60_000, interval: 4_000, label: "tamper #3 commented afresh after the clean save" });
  } finally {
    if (att) {
      await delKvs(`protection-${att.attachmentId}`).catch(() => {});
      await delKvs(`violation-noticed-${pg.id}-${att.attachmentId}-content-loss`).catch(() => {});
      await delKvs(`violation-noticed-${pg.id}-${att.attachmentId}-revert-failed`).catch(() => {});
    }
    await deletePage(pg.id).catch(() => {});
  }
});
