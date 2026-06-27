// Sentinel Vault DEEP — sealed ATTACHMENT trash-restore (artifact-trigger, previously NONE-GAP).
// Seals an attachment, trashes it as a non-owner, and asserts the artifact-trigger un-trashes it.
// PROBE: handleSealedArtifactTrash needs the trashed event's version.number — if Forge omits it,
// the restore silently skips and the seal is cleaned up (a real protection gap).
import { test, expect } from "@playwright/test";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadAttachment } from "../../data/confluence.mjs";
// @ts-ignore
import { request } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DUMMY = "557058:dummy-other";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.describe.configure({ timeout: 180_000 });

test("🔎 a trashed sealed attachment is restored from trash (artifact-trigger)", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const page = await createPage({ spaceId, title: `HARNESS sv-trash ${Date.now()}`, adf: doc(para("seed")) });
  let att: any;
  try {
    att = await uploadAttachment(page.id, "seal-me.txt", "harness trash bytes");
    await setKvs(`protection-${att.attachmentId}`, {
      contentId: page.id, attachmentId: att.attachmentId, sealedFileId: att.fileId,
      lockedBy: DUMMY, lockedByName: "Other", attachmentName: "seal-me.txt", spaceId, expiresAt: null,
    });

    // Trash the attachment (v1 delete = move to trash) → fires avi:confluence:trashed:attachment.
    const del = await request("DELETE", `/wiki/rest/api/content/${att.attachmentId}`, { raw: true });
    console.log(`trash → HTTP ${del.status}`);
    expect(del.status, "trash request accepted").toBeLessThan(400);

    // The artifact-trigger should un-trash it back to status=current.
    const result = await waitForTerminal(async () => {
      const r = await request("GET", `/wiki/api/v2/attachments/${att.attachmentId}`, { raw: true });
      if (r.status >= 400) return false; // not visible yet (trashed)
      const s = JSON.parse(r.text).status;
      return s === "current" ? "current" : false;
    }, { timeout: 70_000, interval: 4_000, label: "sealed attachment restored from trash" });
    console.log(`trash-restore → status=${result}, seal still present=${Boolean(await getKvs(`protection-${att.attachmentId}`))}`);
    expect(result, "the sealed attachment must be restored to current (not left trashed)").toBe("current");
  } finally {
    if (att) await delKvs(`protection-${att.attachmentId}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});
