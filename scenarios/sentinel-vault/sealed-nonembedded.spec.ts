// Sentinel Vault DEEP — adversarial-hunt Finding 1 regression: a sealed attachment that was
// NEVER embedded in the page body (the most common seal shape — "seal contract.pdf" from the
// attachments list) must be SILENT under ordinary non-owner page edits. Pre-fix, the media pass
// defined "violation" as pure absence of the fileId from the ADF, so every non-owner save on
// such a page produced a phantom content-removal → 5-version lookback dead-end → a false
// "could NOT automatically restore" comment naming the innocent editor, forever.
// Post-fix the seal record carries embed-presence at seal time (embedded:false here) and the
// pipeline must not treat absence-of-something-never-there as tamper.
//   phantom lane: seeded embedded:false seal + TWO non-owner paragraph tweaks → 60s window with
//     ZERO violation comments and ZERO app-authored page writes (version pinned at our last write).
//   positive control: a second SEALED+EMBEDDED attachment on the SAME page whose node we then
//     remove → restore + exactly one comment (proves the pipeline was live while we observed silence).
// Seal owner is SYNTHETIC; the API actor (mihai) is the non-owner editor. Self-cleaning.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadAttachment, uploadBinaryAttachment, TINY_PNG, mediaNodeWithAttrs, readPage, getAttachment, writeAdf, countCommentsMatching, setContentProperty } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DUMMY = "557058:dummy-other";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.describe.configure({ timeout: 420_000 });

test("🔎 never-embedded seal is SILENT under non-owner edits; embedded control still enforces (Finding 1)", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const stamp = Date.now();
  const phantomName = `sv-phantom-${stamp}.txt`; // sealed but never embedded (the contract.pdf shape)
  const controlName = `sv-phantom-ctl-${stamp}.png`; // sealed AND embedded (positive control)
  const pg = await createPage({ spaceId, title: `HARNESS sv-nonembedded ${stamp}`, adf: doc(para("phantom seed")) });
  let phantom: any, control: any;
  try {
    phantom = await uploadAttachment(pg.id, phantomName, "sealed but never embedded");
    control = await uploadBinaryAttachment(pg.id, controlName, TINY_PNG, "image/png");

    // Embed ONLY the control, then capture its presentation baseline from a post-embed READ
    // (normalization-consistent with the trigger's own reads — the sealed-media-attrs pattern).
    const base = await readPage(pg.id);
    base.adf.content.push(mediaNodeWithAttrs(control.fileId, pg.id));
    await writeAdf(pg.id, base.adf, { message: "embed control image" });
    const embeddedRead = await readPage(pg.id);
    let baseline: any = null;
    for (const node of embeddedRead.adf.content) {
      if (node?.type === "mediaSingle" && JSON.stringify(node).includes(control.fileId)) {
        const m = (node.content || []).find((c: any) => c?.type === "media");
        baseline = {
          layout: node.attrs?.layout ?? null, width: node.attrs?.width ?? null,
          widthType: node.attrs?.widthType ?? null,
          mediaWidth: m?.attrs?.width ?? null, mediaHeight: m?.attrs?.height ?? null,
        };
      }
    }
    expect(baseline, "control baseline captured from post-embed read").toBeTruthy();

    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();
    // The seal under test: embedded:false + mediaBaseline:null — exactly what sealArtifact
    // records for an attachment whose fileId is absent from the body at seal time.
    await setKvs(`protection-${phantom.attachmentId}`, {
      contentId: pg.id, attachmentId: phantom.attachmentId, sealedFileId: phantom.fileId,
      lockedBy: DUMMY, lockedByName: "Other", attachmentName: phantomName, spaceId, expiresAt,
      sealedVersion: 1, lockDuration: 14400, embedded: false, mediaBaseline: null,
    });
    await setKvs(`protection-${control.attachmentId}`, {
      contentId: pg.id, attachmentId: control.attachmentId, sealedFileId: control.fileId,
      lockedBy: DUMMY, lockedByName: "Other", attachmentName: controlName, spaceId, expiresAt,
      sealedVersion: 1, lockDuration: 14400, embedded: true, mediaBaseline: baseline,
    });
    // The protection- content property is the media fast-path GATE (collectMediaSealsForPage
    // early-returns without it) — one property, both rows.
    await setContentProperty(pg.id, "protection-", [
      { attachmentId: phantom.attachmentId, lockedBy: DUMMY },
      { attachmentId: control.attachmentId, lockedBy: DUMMY },
    ]);

    // TWO ordinary non-owner page edits (the colleague-fixes-a-typo shape). Each one, pre-fix,
    // minted a phantom violation for the never-embedded seal.
    const tweak1 = await readPage(pg.id);
    tweak1.adf.content.push(para(`typo fix one ${stamp}`));
    await writeAdf(pg.id, tweak1.adf, { message: "non-owner edit 1" });
    await new Promise((r) => setTimeout(r, 3000));
    const tweak2 = await readPage(pg.id);
    tweak2.adf.content.push(para(`typo fix two ${stamp}`));
    const lastWrite = await writeAdf(pg.id, tweak2.adf, { message: "non-owner edit 2" });
    const pinnedVersion = lastWrite.version.number;
    console.log(`### two non-owner edits issued; version pinned at ${pinnedVersion}`);

    // 60s observation window: the page version must stay at OUR last write (zero app-authored
    // writes — no splice, no "restore") and zero violation comments for either filename.
    const observeUntil = Date.now() + 60_000;
    while (Date.now() < observeUntil) {
      const now = await readPage(pg.id);
      expect(now.version, "no app-authored page write (version pinned)").toBe(pinnedVersion);
      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(await countCommentsMatching(pg.id, phantomName), "ZERO violation comments for the never-embedded seal").toBe(0);
    expect(await countCommentsMatching(pg.id, controlName), "untouched embedded control drew no comment either").toBe(0);
    expect((await getAttachment(phantom.attachmentId)).status, "phantom attachment untouched").toBe("current");
    console.log("### phantom window silent ✓ (no comments, no writes)");

    // POSITIVE CONTROL: remove the embedded control's node as the same non-owner → the pipeline
    // must restore it and post exactly one comment — proving it was LIVE during the silence above.
    const cur = await readPage(pg.id);
    const body = JSON.parse(JSON.stringify(cur.adf));
    body.content = body.content.filter((n: any) => !(n?.type === "mediaSingle" && JSON.stringify(n).includes(control.fileId)));
    await writeAdf(pg.id, body, { message: "remove embedded control (positive control)" });
    await waitForTerminal(async () => (JSON.stringify((await readPage(pg.id)).adf).includes(control.fileId) ? "restored" : false),
      { timeout: 90_000, interval: 4_000, label: "positive control: removed embedded control restored" });
    await new Promise((r) => setTimeout(r, 8000)); // let the comment land
    expect(await countCommentsMatching(pg.id, controlName), "positive control: exactly one violation comment").toBe(1);
    expect(await countCommentsMatching(pg.id, phantomName), "phantom seal STILL silent after control tamper").toBe(0);
    console.log("### positive control: restore + one comment ✓ (pipeline was live)");
  } finally {
    for (const a of [phantom, control]) {
      if (!a) continue;
      await delKvs(`protection-${a.attachmentId}`).catch(() => {});
      await delKvs(`violation-noticed-${pg.id}-${a.attachmentId}-content-loss`).catch(() => {});
      await delKvs(`violation-noticed-${pg.id}-${a.attachmentId}-revert-failed`).catch(() => {});
    }
    await deletePage(pg.id).catch(() => {});
  }
});
