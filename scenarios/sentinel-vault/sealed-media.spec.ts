// Sentinel Vault DEEP — sealed MEDIA restore (artifact protection + the SV-M6 backward version-walk).
// Previously NONE-GAP: the SV-M6 fix shipped with ZERO live coverage. Seals a real attachment embedded
// in a page, removes the media as a non-owner, and asserts the page-content-trigger re-inserts it —
// including the case where the media is several versions back (only the backward walk can find it).
import { test, expect } from "@playwright/test";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, deletePage, uploadAttachment, mediaNode, setContentProperty } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DUMMY = "557058:dummy-other";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...nodes: any[]) => ({ version: 1, type: "doc", content: nodes });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const hasFile = (adf: any, fileId: string) => JSON.stringify(adf).includes(fileId);

test.describe.configure({ timeout: 220_000 });

// Seal a media file: the KVS record (the seal) + the page content property (the fast-path gate
// collectMediaSealsForPage probes). lockedBy = a non-owner so OUR edit is a violation.
async function sealMedia(pageId: string, attachmentId: string, fileId: string) {
  await setKvs(`protection-${attachmentId}`, {
    contentId: pageId, attachmentId, sealedFileId: fileId,
    lockedBy: DUMMY, lockedByName: "Other", attachmentName: "seal-me.txt", expiresAt: null,
  });
  await setContentProperty(pageId, "protection-", [{ attachmentId, lockedBy: DUMMY }]);
}

test("🔎 a removed sealed MEDIA block is auto-restored (artifact protection, verified live)", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const page = await createPage({ spaceId, title: `HARNESS sv-media ${Date.now()}`, adf: doc(para("seed")) });
  let att: any;
  try {
    att = await uploadAttachment(page.id, "seal-me.txt", "harness sealed bytes");
    await writeAdf(page.id, doc(para("TOP"), mediaNode(att.fileId, page.id), para("BOTTOM")));
    await waitForTerminal(async () => hasFile((await readPage(page.id)).adf, att.fileId), { timeout: 20_000, label: "media embedded" });
    await sealMedia(page.id, att.attachmentId, att.fileId);

    const v = (await readPage(page.id)).version;
    await writeAdf(page.id, doc(para("TOP"), para("BOTTOM"))); // tamper: remove the media (as a non-owner)
    const restored: any = await waitForTerminal(async () => {
      const p = await readPage(page.id);
      return p.version > v + 1 && hasFile(p.adf, att.fileId) ? p : false;
    }, { timeout: 60_000, interval: 3_000, label: "sealed media restored" });
    console.log(`media restore → v${restored.version}, fileId present=${hasFile(restored.adf, att.fileId)}`);
    expect(hasFile(restored.adf, att.fileId), "the sealed media must be re-inserted").toBe(true);
  } finally {
    if (att) await delKvs(`protection-${att.attachmentId}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});

test("🔎 SV-M6: sealed media removed several versions back is still restored (backward walk)", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const page = await createPage({ spaceId, title: `HARNESS sv-media-m6 ${Date.now()}`, adf: doc(para("seed")) });
  let att: any;
  try {
    att = await uploadAttachment(page.id, "seal-me.txt", "harness sealed bytes m6");
    await writeAdf(page.id, doc(para("TOP"), mediaNode(att.fileId, page.id), para("BOTTOM"))); // media PRESENT
    await waitForTerminal(async () => hasFile((await readPage(page.id)).adf, att.fileId), { timeout: 20_000, label: "media embedded" });
    // Remove it + churn two more versions, all WITHOUT a seal → no restore yet → media is now ~4 versions back.
    await writeAdf(page.id, doc(para("TOP"), para("BOTTOM")));
    await writeAdf(page.id, doc(para("TOP-edit-1"), para("BOTTOM")));
    await writeAdf(page.id, doc(para("TOP-edit-2"), para("BOTTOM")));
    // Now seal it, then make ONE trigger-edit. currentVersion-1 lacks the media; only the SV-M6
    // backward walk (up to 5 versions) can find it where it was last present.
    await sealMedia(page.id, att.attachmentId, att.fileId);
    const v = (await readPage(page.id)).version;
    await writeAdf(page.id, doc(para("TOP-edit-3"), para("BOTTOM")));
    const restored: any = await waitForTerminal(async () => {
      const p = await readPage(page.id);
      return p.version > v + 1 && hasFile(p.adf, att.fileId) ? p : false;
    }, { timeout: 70_000, interval: 3_000, label: "SV-M6 media restored from several versions back" });
    console.log(`SV-M6 media restore → v${restored.version}, fileId present=${hasFile(restored.adf, att.fileId)}`);
    expect(hasFile(restored.adf, att.fileId), "the SV-M6 backward walk must restore media that's several versions back").toBe(true);
  } finally {
    if (att) await delKvs(`protection-${att.attachmentId}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});
